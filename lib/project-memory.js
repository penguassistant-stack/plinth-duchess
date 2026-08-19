export const PROJECT_MEMORY = {
  project: "Duchess Residences renovation",
  participants: [
    { name: "Mel", aliases: ["Melissa", "Mel"], role: "Primary homeowner", authority: "Project administrator and final record reviewer" },
    { name: "Mom", aliases: ["Mom", "Mum", "Homeowner 2"], role: "Co-homeowner", authority: "May express preferences, confirm choices and own actions" },
    { name: "Xin Hao", aliases: ["XH", "Xin Hao", "Xinhao"], role: "Interior designer", authority: "Coordinates design, site, contractors and project progress" }
  ],
  roomAliases: {
    "Whole unit": ["whole house", "whole unit", "all rooms"],
    "Living room": ["living", "lounge"],
    "Dining room": ["dining"],
    "Kitchen": ["kitchen"],
    "Wine lounge": ["wine room", "wine counter"],
    "Master bedroom": ["master", "MBR", "master room"],
    "Bedroom 2 + bath": ["bedroom 2", "BR2", "Mom's room", "Mum's room", "common bathroom"],
    "Study room": ["study", "Murphy bed room"],
    "Helper’s room + WC": ["helper room", "maid room", "helper WC", "service yard"],
    "Airwell / courtyard": ["airwell", "courtyard"],
    "Basement / parking": ["basement", "parking"],
  },
  workstreams: [
    "Design & approvals",
    "Site preparation & protection",
    "Demolition & structural works",
    "Carpentry & built-ins",
    "Electrical & lighting",
    "Plumbing & sanitary",
    "Air-conditioning & ventilation",
    "Flooring, walls & finishes",
    "Doors, windows & glazing",
    "Painting",
    "External works & roofing",
    "Furniture, appliances & purchases",
    "Deliveries & installation",
    "Defects & handover"
  ],
  providers: [
    { name: "JUZ Interior", role: "Main renovation contractor" },
    { name: "2D3D", role: "Carpentry contractor" },
    { name: "Mgpaintingsg", role: "Painting provider" },
    { name: "Adoore", role: "Glass door provider" },
    { name: "PD Doors", role: "Door provider" }
  ],
  rules: [
    "Rooms and workstreams are separate dimensions.",
    "A preference is not a confirmed decision unless the conversation confirms agreement or commitment.",
    "If Mom expresses a preference and Mel agrees, attribute the decision to both homeowners.",
    "If homeowners conflict, keep the matter awaiting homeowner alignment.",
    "Furniture and personal-purchase prices are private. Renovation and carpentry costs may be tracked separately.",
    "Later explicit statements supersede earlier ones while preserving history.",
    "One fact has one canonical record; supporting conversations are evidence, not duplicate records."
  ]
};

export function compactProjectMemory() {
  return JSON.stringify(PROJECT_MEMORY);
}
