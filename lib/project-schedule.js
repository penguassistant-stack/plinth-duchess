export const PROJECT_SCHEDULE = [
  ["Hacking", "Demolition & structural works", "2026-08-11", "2026-08-14"],
  ["Plumbing", "Plumbing & sanitary", "2026-08-17", "2026-08-20"],
  ["Electrical first fix", "Electrical & lighting", "2026-08-21", "2026-08-24"],
  ["Air-conditioning piping", "Air-conditioning & ventilation", "2026-08-24", "2026-08-25"],
  ["Tiling and masonry", "Flooring, walls & finishes", "2026-08-26", "2026-09-18"],
  ["Ceiling and partition work", "Flooring, walls & finishes", "2026-09-25", "2026-09-25"],
  ["First wash", "Site preparation & protection", "2026-09-25", "2026-09-25"],
  ["Carpentry detailing confirmation", "Carpentry & built-ins", "2026-09-25", "2026-09-25", "homeowner"],
  ["Measure doors", "Doors, windows & glazing", "2026-09-28", "2026-09-28", "homeowner"],
  ["Sink, hob, hood, sanitary wares and lighting delivery", "Deliveries & installation", "2026-09-28", "2026-09-28", "homeowner"],
  ["Painting", "Painting", "2026-09-28", "2026-10-02"],
  ["Carpentry fabrication", "Carpentry & built-ins", "2026-09-28", "2026-10-16", "factory"],
  ["Light installation", "Electrical & lighting", "2026-10-05", "2026-10-05"],
  ["Doors installation", "Doors, windows & glazing", "2026-10-16", "2026-10-16"],
  ["Carpentry installation", "Carpentry & built-ins", "2026-10-19", "2026-10-30"],
  ["Measure worktop", "Carpentry & built-ins", "2026-10-21", "2026-10-21"],
  ["Install worktop", "Carpentry & built-ins", "2026-10-27", "2026-10-27"],
  ["Discuss bathroom accessories location", "Plumbing & sanitary", "2026-10-30", "2026-10-30", "homeowner"],
  ["Sanitary wares installation", "Plumbing & sanitary", "2026-11-02", "2026-11-02"],
  ["Electrical final", "Electrical & lighting", "2026-11-03", "2026-11-03"],
  ["Air-conditioning installation", "Air-conditioning & ventilation", "2026-11-03", "2026-11-03"],
  ["Vinyl installation", "Flooring, walls & finishes", "2026-11-04", "2026-11-06"],
  ["Painting touch-up", "Painting", "2026-11-09", "2026-11-09"],
  ["General touch-up", "Defects & handover", "2026-11-10", "2026-11-12"],
  ["Cleaning", "Defects & handover", "2026-11-13", "2026-11-13"],
  ["Handover", "Defects & handover", "2026-11-14", "2026-11-14", "homeowner"]
].map(([name, workstream, start, end, involvement]) => ({ name, workstream, start, end, involvement: involvement || null }));

export function compactProjectSchedule() {
  return JSON.stringify({
    timezone: "Asia/Singapore",
    constraints: ["No noise-pollution work on public-holiday eves, Saturdays or Sundays", "No work on public holidays", "Additional or altered work during progress may delay completion"],
    activities: PROJECT_SCHEDULE
  });
}
