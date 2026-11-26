// Shared Handlebars helpers so every portal renders the same navbar/theme.
export const registerHelpers = (hbs) => {
  hbs.registerHelper("eq", (a, b) => a === b);
  hbs.registerHelper("ne", (a, b) => a !== b);
  hbs.registerHelper("gt", (a, b) => Number(a) > Number(b));
  hbs.registerHelper("lt", (a, b) => Number(a) < Number(b));
  hbs.registerHelper("and", (a, b) => a && b);
  hbs.registerHelper("or", (...args) => args.slice(0, -1).some(Boolean));
  hbs.registerHelper("not", (value) => !value);
  hbs.registerHelper("initial", (value) =>
    value ? String(value).trim().charAt(0).toUpperCase() : "?"
  );
  hbs.registerHelper("date", (value) => {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
  });
};

// Register partials from one canonical directory (shared theme), then allow an
// app-specific override for any partial it defines locally.
export const registerSharedPartials = (hbs, { fs, path, appRoot, sharedRoot }) => {
  const load = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const file of fs.readdirSync(dir).filter((name) => name.endsWith(".xian"))) {
      hbs.registerPartial(
        path.basename(file, ".xian"),
        fs.readFileSync(path.join(dir, file), "utf8")
      );
    }
  };

  // App-specific first, then shared canonical theme overrides head/navbar/footer.
  load(path.join(appRoot, "views/partials"));
  load(path.join(sharedRoot, "views/partials"));
};
