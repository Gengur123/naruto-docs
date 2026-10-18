// lesson.config.mjs: the only file that names this lesson's files.
// Build it from the site folder: npm run build-lesson -- scripts/lesson-player/example
export default {
  // The lesson's script files, in the order they must load. The player loads before them.
  sources: ['lesson.js'],
  // The global variable the last source defines: the lesson object.
  lesson: 'EXAMPLE_LESSON',
  // The lesson's colour tokens. The player's layout is added after them.
  styles: ['theme.css'],
  // The terms the captions and cards link: a JSON list of { term, plain }.
  glossary: 'glossary.json',
};
