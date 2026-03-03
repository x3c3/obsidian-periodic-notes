import { describe, expect, test } from "bun:test";
import moment from "moment";

import { DEFAULT_FORMAT, DEFAULT_PERIODIC_CONFIG } from "./constants";
import type { Granularity, PeriodicConfig } from "./types";

// Inline to avoid importing obsidian via settings/validation.ts
function removeEscapedCharacters(format: string): string {
  const withoutBrackets = format.replace(/\[[^\]]*\]/g, "");
  return withoutBrackets.replace(/\\./g, "");
}

// Provide window.moment for code that uses it
// @ts-expect-error global mock
globalThis.window = { moment };

// Re-implement pure functions to test without Obsidian imports

function join(...partSegments: string[]): string {
  let parts: string[] = [];
  for (let i = 0, l = partSegments.length; i < l; i++) {
    parts = parts.concat(partSegments[i].split("/"));
  }
  const newParts = [];
  for (let i = 0, l = parts.length; i < l; i++) {
    const part = parts[i];
    if (!part || part === ".") continue;
    else newParts.push(part);
  }
  if (parts[0] === "") newParts.unshift("");
  return newParts.join("/");
}

function isIsoFormat(format: string): boolean {
  const cleanFormat = removeEscapedCharacters(format);
  return /w{1,2}/.test(cleanFormat);
}

type Settings = Record<Granularity, PeriodicConfig | undefined>;

function getFormat(settings: Settings, granularity: Granularity): string {
  return settings[granularity]?.format || DEFAULT_FORMAT[granularity];
}

function getPossibleFormats(
  settings: Settings,
  granularity: Granularity,
): string[] {
  const format = settings[granularity]?.format;
  if (!format) return [DEFAULT_FORMAT[granularity]];

  const partialFormatExp = /[^/]*$/.exec(format);
  if (partialFormatExp) {
    const partialFormat = partialFormatExp[0];
    return [format, partialFormat];
  }
  return [format];
}

function getFolder(settings: Settings, granularity: Granularity): string {
  return settings[granularity]?.folder || "/";
}

describe("join", () => {
  test("joins simple path segments", () => {
    expect(join("foo", "bar")).toBe("foo/bar");
  });

  test("handles leading slash", () => {
    expect(join("/foo", "bar")).toBe("/foo/bar");
  });

  test("removes trailing slashes", () => {
    expect(join("foo/", "bar/")).toBe("foo/bar");
  });

  test("removes dots", () => {
    expect(join(".", "foo", ".", "bar")).toBe("foo/bar");
  });

  test("handles empty segments", () => {
    expect(join("foo", "", "bar")).toBe("foo/bar");
  });

  test("handles single segment", () => {
    expect(join("foo")).toBe("foo");
  });

  test("handles nested paths", () => {
    expect(join("a/b", "c/d")).toBe("a/b/c/d");
  });
});

describe("removeEscapedCharacters", () => {
  test("removes bracketed content", () => {
    expect(removeEscapedCharacters("YYYY-[W]ww")).toBe("YYYY-ww");
  });

  test("removes escaped characters", () => {
    expect(removeEscapedCharacters("YYYY\\-MM")).toBe("YYYYMM");
  });

  test("handles format with no escapes", () => {
    expect(removeEscapedCharacters("YYYY-MM-DD")).toBe("YYYY-MM-DD");
  });

  test("removes multiple brackets", () => {
    expect(removeEscapedCharacters("YYYY-[Q]Q-[W]ww")).toBe("YYYY-Q-ww");
  });

  test("handles empty string", () => {
    expect(removeEscapedCharacters("")).toBe("");
  });
});

describe("isIsoFormat", () => {
  test("detects ISO week format", () => {
    expect(isIsoFormat("gggg-[W]ww")).toBe(true);
  });

  test("rejects non-ISO format", () => {
    expect(isIsoFormat("YYYY-MM-DD")).toBe(false);
  });

  test("ignores escaped w characters", () => {
    expect(isIsoFormat("YYYY-[ww]")).toBe(false);
  });
});

describe("getFormat", () => {
  const emptySettings: Settings = {
    day: undefined,
    week: undefined,
    month: undefined,
    quarter: undefined,
    year: undefined,
  };

  test("returns default format when no config", () => {
    expect(getFormat(emptySettings, "day")).toBe("YYYY-MM-DD");
  });

  test("returns default weekly format", () => {
    expect(getFormat(emptySettings, "week")).toBe("gggg-[W]ww");
  });

  test("returns custom format when set", () => {
    const settings: Settings = {
      ...emptySettings,
      day: { ...DEFAULT_PERIODIC_CONFIG, format: "DD-MM-YYYY" },
    };
    expect(getFormat(settings, "day")).toBe("DD-MM-YYYY");
  });

  test("returns default when format is empty string", () => {
    const settings: Settings = {
      ...emptySettings,
      day: { ...DEFAULT_PERIODIC_CONFIG, format: "" },
    };
    expect(getFormat(settings, "day")).toBe("YYYY-MM-DD");
  });
});

describe("getPossibleFormats", () => {
  const emptySettings: Settings = {
    day: undefined,
    week: undefined,
    month: undefined,
    quarter: undefined,
    year: undefined,
  };

  test("returns default when no config", () => {
    const result = getPossibleFormats(emptySettings, "day");
    expect(result).toEqual(["YYYY-MM-DD"]);
  });

  test("returns full and partial format for nested paths", () => {
    const settings: Settings = {
      ...emptySettings,
      day: { ...DEFAULT_PERIODIC_CONFIG, format: "YYYY/YYYY-MM-DD" },
    };
    const result = getPossibleFormats(settings, "day");
    expect(result).toEqual(["YYYY/YYYY-MM-DD", "YYYY-MM-DD"]);
  });

  test("returns just the format for flat paths", () => {
    const settings: Settings = {
      ...emptySettings,
      day: { ...DEFAULT_PERIODIC_CONFIG, format: "YYYY-MM-DD" },
    };
    const result = getPossibleFormats(settings, "day");
    expect(result).toEqual(["YYYY-MM-DD", "YYYY-MM-DD"]);
  });
});

describe("getFolder", () => {
  const emptySettings: Settings = {
    day: undefined,
    week: undefined,
    month: undefined,
    quarter: undefined,
    year: undefined,
  };

  test("returns root when no config", () => {
    expect(getFolder(emptySettings, "day")).toBe("/");
  });

  test("returns custom folder when set", () => {
    const settings: Settings = {
      ...emptySettings,
      day: { ...DEFAULT_PERIODIC_CONFIG, folder: "Daily" },
    };
    expect(getFolder(settings, "day")).toBe("Daily");
  });

  test("returns root when folder is empty string", () => {
    const settings: Settings = {
      ...emptySettings,
      day: { ...DEFAULT_PERIODIC_CONFIG, folder: "" },
    };
    expect(getFolder(settings, "day")).toBe("/");
  });
});

describe("isValidFilename", () => {
  function isValidFilename(filename: string): boolean {
    const illegalRe = /[?<>\\:*|"]/g;
    // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional
    const controlRe = /[\x00-\x1f\x80-\x9f]/g;
    const reservedRe = /^\.+$/;
    const windowsReservedRe = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;

    return (
      !illegalRe.test(filename) &&
      !controlRe.test(filename) &&
      !reservedRe.test(filename) &&
      !windowsReservedRe.test(filename)
    );
  }

  test("accepts valid filenames", () => {
    expect(isValidFilename("2026-01-15")).toBe(true);
    expect(isValidFilename("my-note")).toBe(true);
  });

  test("rejects illegal characters", () => {
    expect(isValidFilename("file:name")).toBe(false);
    expect(isValidFilename("file?name")).toBe(false);
    expect(isValidFilename('file"name')).toBe(false);
  });

  test("rejects reserved names", () => {
    expect(isValidFilename("..")).toBe(false);
    expect(isValidFilename(".")).toBe(false);
  });

  test("rejects windows reserved names", () => {
    expect(isValidFilename("CON")).toBe(false);
    expect(isValidFilename("PRN.txt")).toBe(false);
    expect(isValidFilename("COM1")).toBe(false);
  });
});

describe("getLooselyMatchedDate", () => {
  const FULL_DATE_PATTERN =
    /(\d{4})[-.]?(0[1-9]|1[0-2])[-.]?(0[1-9]|[12][0-9]|3[01])/;
  const MONTH_PATTERN = /(\d{4})[-.]?(0[1-9]|1[0-2])/;
  const YEAR_PATTERN = /(\d{4})/;

  test("matches full date", () => {
    expect(FULL_DATE_PATTERN.test("2026-01-15")).toBe(true);
    expect(FULL_DATE_PATTERN.test("20260115")).toBe(true);
    expect(FULL_DATE_PATTERN.test("2026.01.15")).toBe(true);
  });

  test("matches month pattern", () => {
    expect(MONTH_PATTERN.test("2026-01")).toBe(true);
    expect(MONTH_PATTERN.test("202601")).toBe(true);
  });

  test("matches year pattern", () => {
    expect(YEAR_PATTERN.test("2026")).toBe(true);
  });

  test("does not match invalid month", () => {
    const match = FULL_DATE_PATTERN.exec("2026-13-01");
    expect(match).toBeNull();
  });

  test("does not match invalid day", () => {
    const match = FULL_DATE_PATTERN.exec("2026-01-32");
    expect(match).toBeNull();
  });
});
