// DocsWindow: one Wails v3 window that shows the built documentation site (docs/site/dist)
// straight from the folder. There is no server and no TCP port: the webview asks Wails for
// each file and this program answers from the folder (http://wails.localhost on Windows).
//
//	DocsWindow <dist-dir> [title] [start-path]
//
// A link that leaves the site is not followed in the window. A script added to every page
// catches the click (and window.open) and hands the address to this program, which opens it
// in the default browser.
//
// DANDORI_WINDOW_SELF_CHECK=1 is for `npm run window:check`: the page runs one Pagefind
// search, then clicks a link to https://dandori.invalid/. This program prints what the page
// saw and whether the link reached the browser hand-over (logged, not opened), and exits 0
// only when both worked on the page asked for (not the 404 page).
// DANDORI_WINDOW_CHECK_QUERY sets the search word (default: dandori).
package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
)

const checkLink = "https://dandori.invalid/outside-link-check"

// pageScript is added to every HTML page the window shows.
const pageScript = `<script>(() => {
  if (window.__dandoriWindow) return;
  window.__dandoriWindow = true;
  const post = (m) => {
    const cw = window.chrome && window.chrome.webview;
    if (cw) return cw.postMessage(m);
    const wk = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.external;
    if (wk) wk.postMessage(m);
  };
  // The address when it leaves the site and the browser should have it; null otherwise.
  const outside = (raw) => {
    let t;
    try { t = new URL(raw, location.href); } catch { return null; }
    if (t.protocol === 'mailto:' || t.protocol === 'tel:') return t;
    if ((t.protocol === 'http:' || t.protocol === 'https:') && t.origin !== location.origin) return t;
    return null;
  };
  const onClick = (e) => {
    const a = e.target && e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    const t = outside(a.href);
    if (t) {
      e.preventDefault();
      e.stopImmediatePropagation();
      post('dandori:open:' + t.href);
    } else if (a.target === '_blank' && /^https?:$/.test(new URL(a.href).protocol)) {
      e.preventDefault();
      location.href = a.href;
    }
  };
  document.addEventListener('click', onClick, true);
  document.addEventListener('auxclick', onClick, true);
  const open = window.open;
  window.open = function (u, ...rest) {
    const t = outside(String(u ?? ''));
    if (t) { post('dandori:open:' + t.href); return null; }
    if (u) { location.href = new URL(u, location.href).href; return window; }
    return open.call(window, u, ...rest);
  };
  if (window.__dandoriSelfCheck) {
    window.addEventListener('load', async () => {
      const out = { title: document.title, searchBox: document.querySelector('site-search') !== null, query: window.__dandoriCheckQuery };
      try {
        const pagefind = await import('/pagefind/pagefind.js');
        const found = await pagefind.search(out.query);
        const sections = new Set();
        for (const r of found.results) {
          const data = await r.data();
          sections.add(data.url.split('/').filter(Boolean)[0] ?? 'overview');
        }
        out.hits = found.results.length;
        out.sections = [...sections].sort();
      } catch (e) {
        out.error = String(e);
      }
      const a = document.createElement('a');
      a.href = '` + checkLink + `';
      a.textContent = 'outside';
      document.body.appendChild(a);
      a.click();
      a.remove();
      out.stillHere = location.href;
      post('dandori:check:' + JSON.stringify(out));
    });
  }
})();</script>`

var headTag = regexp.MustCompile(`(?i)<head[^>]*>`)

func withScript(page, script []byte) []byte {
	if loc := headTag.FindIndex(page); loc != nil {
		return append(append(append([]byte{}, page[:loc[1]]...), script...), page[loc[1]:]...)
	}
	return append(append([]byte{}, script...), page...)
}

// site answers from dir. HTML pages get the script; Pagefind's files get a type the webview
// accepts (Go knows .wasm; .pagefind and .pf_* are binary).
func site(dir string, script []byte) http.Handler {
	files := http.FileServer(http.Dir(dir))
	sendPage := func(w http.ResponseWriter, file string, status int) bool {
		data, err := os.ReadFile(file)
		if err != nil {
			return false
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		w.WriteHeader(status)
		w.Write(withScript(data, script))
		return true
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := path.Clean("/" + r.URL.Path)
		full := filepath.Join(dir, filepath.FromSlash(p))
		st, err := os.Stat(full)
		if err == nil && st.IsDir() {
			if !strings.HasSuffix(r.URL.Path, "/") {
				http.Redirect(w, r, p+"/", http.StatusMovedPermanently)
				return
			}
			full = filepath.Join(full, "index.html")
			st, err = os.Stat(full)
		}
		if err != nil {
			if !sendPage(w, filepath.Join(dir, "404.html"), http.StatusNotFound) {
				http.NotFound(w, r)
			}
			return
		}
		if strings.EqualFold(filepath.Ext(full), ".html") && sendPage(w, full, http.StatusOK) {
			return
		}
		switch ext := path.Ext(p); {
		case ext == ".wasm":
			w.Header().Set("Content-Type", "application/wasm")
		case ext == ".pagefind" || strings.HasPrefix(ext, ".pf_"):
			w.Header().Set("Content-Type", "application/octet-stream")
		case ext == ".md":
			w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		}
		files.ServeHTTP(w, r)
	})
}

func fail(code int, format string, a ...any) {
	fmt.Fprintf(os.Stderr, format+"\n", a...)
	os.Exit(code)
}

func main() {
	if len(os.Args) < 2 {
		fail(2, "usage: DocsWindow <dist-dir> [title] [start-path]")
	}
	dir, err := filepath.Abs(os.Args[1])
	if err != nil {
		fail(2, "bad folder: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dir, "index.html")); err != nil {
		fail(2, "no built site in %s (run astro build first)", dir)
	}
	title := "Docs"
	if len(os.Args) > 2 && os.Args[2] != "" {
		title = os.Args[2]
	}
	start := "/"
	if len(os.Args) > 3 && os.Args[3] != "" {
		start = "/" + strings.TrimLeft(os.Args[3], "/")
	}

	selfCheck := os.Getenv("DANDORI_WINDOW_SELF_CHECK") == "1"
	query := os.Getenv("DANDORI_WINDOW_CHECK_QUERY")
	if query == "" {
		query = "dandori"
	}
	script := []byte(pageScript)
	if selfCheck {
		q, _ := json.Marshal(query)
		script = append([]byte(fmt.Sprintf("<script>window.__dandoriSelfCheck=true;window.__dandoriCheckQuery=%s;</script>", q)), script...)
	}

	var (
		mu     sync.Mutex
		opened []string
		status = 1
		app    *application.App
	)
	app = application.New(application.Options{
		Name:   "DandoriDocs",
		Assets: application.AssetOptions{Handler: site(dir, script), DisableLogging: true},
		RawMessageHandler: func(_ application.Window, message string, _ *application.OriginInfo) {
			switch {
			case strings.HasPrefix(message, "dandori:open:"):
				target := strings.TrimPrefix(message, "dandori:open:")
				u, err := url.Parse(target)
				if err != nil || !(u.Scheme == "http" || u.Scheme == "https" || u.Scheme == "mailto" || u.Scheme == "tel") {
					fmt.Printf("not opened: %q\n", target)
					return
				}
				mu.Lock()
				opened = append(opened, u.String())
				mu.Unlock()
				if selfCheck {
					fmt.Printf("would open in the default browser: %s\n", u)
					return
				}
				if err := app.Browser.OpenURL(u.String()); err != nil {
					fmt.Printf("could not open %s in the browser: %v\n", u, err)
				}
			case selfCheck && strings.HasPrefix(message, "dandori:check:"):
				var seen struct {
					Title     string   `json:"title"`
					SearchBox bool     `json:"searchBox"`
					Query     string   `json:"query"`
					Hits      int      `json:"hits"`
					Sections  []string `json:"sections"`
					Error     string   `json:"error"`
					StillHere string   `json:"stillHere"`
				}
				if err := json.Unmarshal([]byte(strings.TrimPrefix(message, "dandori:check:")), &seen); err != nil {
					fmt.Printf("self-check: unreadable answer from the page: %v\n", err)
				}
				mu.Lock()
				routed := false
				for _, o := range opened {
					routed = routed || o == checkLink
				}
				mu.Unlock()
				fmt.Printf("self-check page: %s\n", seen.StillHere)
				fmt.Printf("self-check title: %s\n", seen.Title)
				fmt.Printf("self-check search box on the page: %v\n", seen.SearchBox)
				fmt.Printf("self-check search %q: %d pages in %d sections (%s)\n", seen.Query, seen.Hits, len(seen.Sections), strings.Join(seen.Sections, ", "))
				fmt.Printf("self-check outside link routed to the default-browser hand-over: %v\n", routed)
				if seen.Error != "" {
					fmt.Printf("self-check error in the page: %s\n", seen.Error)
				}
				if routed && seen.Hits > 0 && seen.Error == "" && !strings.HasPrefix(seen.Title, "404") {
					status = 0
				}
				app.Quit()
			}
		},
	})
	app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title: title, Width: 1280, Height: 800, URL: start,
	})
	if selfCheck {
		go func() {
			time.Sleep(60 * time.Second)
			fmt.Println("self-check: no answer from the page within 60 s")
			app.Quit()
		}()
	}
	if err := app.Run(); err != nil {
		fail(1, "window failed: %v", err)
	}
	if selfCheck {
		os.Exit(status)
	}
}
