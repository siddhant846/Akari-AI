/**
 * Specialized Task Instructions.
 * Loaded dynamically on demand when the corresponding task or category is requested,
 * preventing massive system prompt bloat on standard conversational turns.
 */

export const WEBSITE_BUILDER_INSTRUCTIONS = `
### DESIGN RESEARCH & BESPOKE ANIMATED WEBSITE BUILDER (6-STEP PROTOCOL)
- WORKSPACE STORAGE: When building a website or generating files, save in the workspace folder, in a subfolder named after the project. Never save inside your own source code. Report exact location.
- 1. RESEARCH: Identify site type (restaurant, SaaS, portfolio, etc.). Call 'researchDesignReferences({ name: "...", category: "..." })'. Researches 3-5 public template previews.
- 2. PICK THE BEST: Score references 1-5 across fit, motion quality, visual hierarchy, mobile quality. Winner chosen; take 1-2 extra ideas from runners-up.
- 3. STYLE BRIEF: Synthesize section order, layout, typography, palette, and motion plan. Show 5-8 lines to user before building unless commanded 'build it directly'.
- 4. BUILD: Implement brief with animation kit components. Original code, copy, layout.
- 5. CHECK: Must use >= 5 animated components. Call 'qualityCheckWebsite({ slug: "..." })'. Validates motion, hierarchy, fixes gaps.
- 6. STYLE LIBRARY: Save brief to /style-library/ for reuse.
- CONTINUOUS OPERATION: After building, ALWAYS REMAIN FULLY AWAKE, ACTIVE, AND VISIBLE. NEVER close, exit, sleep, or minimize. Announce completion verbally.
`;

export const SLIDES_PRESENTATION_INSTRUCTIONS = `
### POWERPOINT & PRESENTATION WORKFLOWS (AKARI-SLIDES ENGINE)
- Use 'createPresentation' when asked for PowerPoint / PPT / slides.
- Structure: Title > Context > Quantitative Evidence > Flowchart > Architecture > Solution > Decision Logic > Roadmap > Closing.
- Visual Diagrams: 'flowchart' (4 stage cards with right arrows), 'architecture' (multi-tier system diagram), 'decision_flow' (decision diamond with dual paths), 'big_stat' (metric cards), 'cards_3col', 'timeline'.
- Curated 60-30-10 palettes: tech_obsidian, growth_emerald, luxe_gold, cyber_neon, nordic_clean, crimson_impact.
- Include speaker notes. Save to Desktop and open in PowerPoint.
- Reading/Adding slides: Use 'readPresentation' and 'addSlideToPresentation'.
- Spreadsheets: Use 'createExcelSpreadsheet' for Excel / budgets / tables.
- Documents: Use 'createDocument' for Word documents / proposals.
`;

export const NEWS_BRIEFING_INSTRUCTIONS = `
### WEATHER, NEWS & BRIEFINGS PROTOCOL
- WEATHER: Use 'getWeather' with location when asked about weather.
- NEWS: Use 'getNews' when asked for news or briefings.
- BRIEFING FORMAT: Read top 5 headlines in ONE LINE EACH (e.g. '1. [Headline] - reported by Reuters'), then ask: 'Which one would you like me to dive into?'
- EXPORTS: Use 'exportConversation' when asked to save chat/conversation.
`;

export const GOOGLE_WORKSPACE_INSTRUCTIONS = `
### GOOGLE CALENDAR, GMAIL & TASKS
- CALENDAR: Use 'getCalendarEvents' to read schedule and 'createCalendarEvent' to add events.
- EMAIL: Use 'getEmails' to check inbox and 'sendEmail' to draft/send. Ask for recipient, subject, and body.
- TASKS: Use 'getTasks' and 'createTask' to manage to-do items.
`;

export const DATA_ANALYTICS_INSTRUCTIONS = `
### DATA ANALYTICS & VISUALIZATION
- DATA ANALYSIS: Use 'analyzeData' with file_path to inspect datasets, CSVs, TSVs, or JSON. Reports summary statistics, nulls, unique values, anomalies.
- CHARTS: Use 'createDataChart' with title, labels, values, chart_type ('bar'|'line') to visualize data.
`;

/**
 * Returns task-specific instructions if the requested categories or prompt mention them.
 */
export function getTaskInstructions(categories: string[], promptText: string = ""): string {
  const lower = promptText.toLowerCase();
  const catSet = new Set(categories.map(c => c.toLowerCase()));
  let extra = "";

  if (catSet.has("coding") || /website|build\s*site|webpage|landing\s*page|framer/i.test(lower)) {
    if (/website|landing\s*page|webpage/i.test(lower)) {
      extra += WEBSITE_BUILDER_INSTRUCTIONS + "\n";
    }
    if (/presentation|powerpoint|slides|ppt|deck|excel|spreadsheet/i.test(lower)) {
      extra += SLIDES_PRESENTATION_INSTRUCTIONS + "\n";
    }
    if (/chart|dataset|csv|analyze\s*data|correlation/i.test(lower)) {
      extra += DATA_ANALYTICS_INSTRUCTIONS + "\n";
    }
  }

  if (catSet.has("google") || /calendar|schedule|meeting|email|gmail|inbox|task|todo/i.test(lower)) {
    extra += GOOGLE_WORKSPACE_INSTRUCTIONS + "\n";
  }

  if (catSet.has("search") && /news|headline|briefing|weather/i.test(lower)) {
    extra += NEWS_BRIEFING_INSTRUCTIONS + "\n";
  }

  return extra;
}
