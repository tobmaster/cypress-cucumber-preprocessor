import path from "path";

export function ensureIsAbsolute(root: string, maybeRelativePath: string) {
  if (path.isAbsolute(maybeRelativePath)) {
    return maybeRelativePath;
  } else {
    return path.join(root, maybeRelativePath);
  }
}

export function ensureIsRelative(root: string, maybeRelativePath: string) {
  if (path.isAbsolute(maybeRelativePath)) {
    return path.relative(root, maybeRelativePath);
  } else {
    return maybeRelativePath;
  }
}

export function createCacheWith<K extends object, V>(
  cache: {
    get(key: K): V | undefined;
    set(key: K, value: V | undefined): void;
  },
  mapper: (key: K) => V
) {
  return {
    cache,

    get(key: K): V {
      const cacheHit = this.cache.get(key);

      if (cacheHit) {
        return cacheHit;
      }

      const value = mapper(key);
      this.cache.set(key, value);
      return value;
    },
  };
}

export function minIndent(content: string) {
  const match = content.match(/^[ \t]*(?=\S)/gm);

  if (!match) {
    return 0;
  }

  return match.reduce((r, a) => Math.min(r, a.length), Infinity);
}

export function stripIndent(content: string) {
  const indent = minIndent(content);

  if (indent === 0) {
    return content;
  }

  const regex = new RegExp(`^[ \\t]{${indent}}`, "gm");

  return content.replace(regex, "");
}

export default function indent(
  string: string,
  options: { count?: number; indent?: string; includeEmptyLines?: boolean } = {}
) {
  const { count = 1, indent = " ", includeEmptyLines = false } = options;

  if (count === 0) {
    return string;
  }

  const regex = includeEmptyLines ? /^/gm : /^(?!\s*$)/gm;

  return string.replace(regex, indent.repeat(count));
}

export function createCache<K extends object, V>(mapper: (key: K) => V) {
  return createCacheWith(new Map<K, V>(), mapper);
}

export function createWeakCache<K extends object, V>(mapper: (key: K) => V) {
  return createCacheWith(new WeakMap<K, V>(), mapper);
}
