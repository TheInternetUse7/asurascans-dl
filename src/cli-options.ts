export interface ParsedArgs {
  command?: string;
  positionals: string[];
  options: Record<string, string | boolean>;
}

const BOOLEAN_OPTIONS = new Set(["overwrite", "dry-run", "cbz"]);
const CHAPTER_SELECTOR_PATTERN =
  /^(all|latest|latest-public|\d+(?:\.\d+)?(?:\s*-\s*\d+(?:\.\d+)?)?(?:\s*,\s*\d+(?:\.\d+)?(?:\s*-\s*\d+(?:\.\d+)?)?)*)$/i;

export function parseArgs(argv: string[]): ParsedArgs {
  const [command, ...rest] = argv;
  const positionals: string[] = [];
  const options: Record<string, string | boolean> = {};

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];

    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }

    const name = token.slice(2);

    if (BOOLEAN_OPTIONS.has(name)) {
      options[name] = true;
      continue;
    }

    const value = rest[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Option --${name} requires a value.`);
    }

    options[name] = value;
    index += 1;
  }

  return {
    command,
    positionals,
    options,
  };
}

export function normalizeParsedArgs(parsed: ParsedArgs): ParsedArgs {
  const options = { ...parsed.options };
  const positionals = [...parsed.positionals];

  if (parsed.command === "download" && positionals.length > 1) {
    const [seriesInput, ...extras] = positionals;

    if (options.chapters === undefined && extras[0] && CHAPTER_SELECTOR_PATTERN.test(extras[0])) {
      options.chapters = extras.shift() as string;
    }

    if (options.output === undefined && extras[0]) {
      options.output = extras.shift() as string;
    }

    if (options.concurrency === undefined && extras[0] && /^\d+$/.test(extras[0])) {
      options.concurrency = extras.shift() as string;
    }

    return {
      ...parsed,
      positionals: [seriesInput],
      options,
    };
  }

  if (parsed.command === "catalog" && positionals[0] === "download" && positionals.length > 2) {
    const [subcommand, catalogPath, ...extras] = positionals;

    if (options.series === undefined && extras[0] && !extras[0].startsWith("--")) {
      options.series = extras.shift() as string;
    }

    if (options.output === undefined && extras[0]) {
      options.output = extras.shift() as string;
    }

    if (options.concurrency === undefined && extras[0] && /^\d+$/.test(extras[0])) {
      options.concurrency = extras.shift() as string;
    }

    return {
      ...parsed,
      positionals: [subcommand, catalogPath],
      options,
    };
  }

  return {
    ...parsed,
    options,
    positionals,
  };
}
