import type { ToolHandler } from "./registry.js";

const MAX_FETCH = 50_000; // max characters of fetched content

/** Strip HTML tags and return readable text. */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

export const webFetchTool: ToolHandler = async (args) => {
  const url = args.url as string | undefined;

  if (!url) {
    return { content: "Error: 'url' argument is required", isError: true };
  }

  if (!/^https?:\/\//i.test(url)) {
    return { content: "Error: URL must start with http:// or https://", isError: true };
  }

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "OpenAether/0.1" },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      return { content: `Error fetching ${url}: HTTP ${res.status}`, isError: true };
    }

    const contentType = res.headers.get("content-type") || "";
    let content: string;

    if (contentType.includes("application/json")) {
      content = JSON.stringify(await res.json(), null, 2);
    } else {
      const raw = await res.text();
      content = contentType.includes("text/html") ? htmlToText(raw) : raw;
    }

    if (content.length > MAX_FETCH) {
      content = content.slice(0, MAX_FETCH) + "\n\n[... truncated]";
    }

    return { content };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: `Error fetching ${url}: ${msg}`, isError: true };
  }
};

export const webFetchDefinition = {
  name: "WebFetch",
  description: "Fetch a URL and return its content as text (HTML stripped). Use to read web pages, documentation, or APIs.",
  inputSchema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "The URL to fetch (must start with http:// or https://)",
      },
    },
    required: ["url"],
  },
};

export const webSearchTool: ToolHandler = async (args) => {
  const query = args.query as string | undefined;

  if (!query) {
    return { content: "Error: 'query' argument is required", isError: true };
  }

  try {
    // DuckDuckGo instant answer API (free, no key required)
    const res = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`,
      { signal: AbortSignal.timeout(15000) },
    );

    // DuckDuckGo returns 202 with an empty body when there's no instant answer.
    const raw = await res.text();
    const parts: string[] = [];

    if (res.ok && raw) {
      try {
        const data = JSON.parse(raw) as {
          AbstractText?: string;
          Heading?: string;
          RelatedTopics?: Array<{ Text?: string; FirstURL?: string }>;
        };

        if (data.AbstractText) {
          parts.push(`**${data.Heading || "Summary"}**\n${data.AbstractText}`);
        }

        const topics = (data.RelatedTopics || [])
          .filter((t) => t.Text)
          .slice(0, 8);

        if (topics.length > 0) {
          parts.push("**Results:**");
          for (const t of topics) {
            parts.push(`- ${t.Text}`);
          }
        }
      } catch {
        // ignore malformed JSON — fall through to HTML fallback
      }
    }

    if (parts.length > 0) {
      return { content: parts.join("\n\n") };
    }

    // Fall back to fetching the DuckDuckGo HTML results page
    return thisFallback(query);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: `Error searching: ${msg}`, isError: true };
  }

  // Fallback: parse DuckDuckGo HTML search results
  async function thisFallback(q: string): Promise<{ content: string; isError?: boolean }> {
    try {
      const res = await fetch(
        `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`,
        {
          headers: { "User-Agent": "Mozilla/5.0 (OpenAether)" },
          signal: AbortSignal.timeout(15000),
        },
      );
      const html = await res.text();

      const results: string[] = [];
      const linkRe = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
      let m: RegExpExecArray | null;
      while ((m = linkRe.exec(html)) && results.length < 8) {
        let url = m[1]
          .replace(/\/\/duckduckgo\.com\/l\/\?uddg=/, "")
          .replace(/&amp;/g, "&")
          .replace(/&rut=.*$/, "")
          .trim();
        url = decodeURIComponent(url);
        const title = htmlToText(m[2]);
        results.push(`- ${title} — ${url}`);
      }

      if (results.length === 0) {
        return { content: `No search results found for "${q}".` };
      }
      return { content: `**Results:**\n${results.join("\n")}` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { content: `Error searching: ${msg}`, isError: true };
    }
  }
};

export const webSearchDefinition = {
  name: "WebSearch",
  description: "Search the web for a query and return a summary and top results. Use for finding current information.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The search query",
      },
    },
    required: ["query"],
  },
};
