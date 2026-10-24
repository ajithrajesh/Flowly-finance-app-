/**
 * branchConstants.js
 * 
 * Flowly Finance official branch configuration for internal transfers
 * across the three core branches in Kerala.
 */

export const SUPPORTED_BRANCHES = [
  {
    code: "KOCHI",
    id: "branch-kochi-01",
    name: "Kochi Main Branch",
    shortName: "Kochi",
    ifscCode: "FLOW0001001",
    city: "Kochi",
    district: "Ernakulam",
    state: "Kerala",
    pincode: "682016",
    address: "Flowly Towers, MG Road, Ernakulam, Kochi - 682016",
    contactPhone: "+91 484 238 9001",
    color: "#5B2E91", // Purple
  },
  {
    code: "TRIVANDRUM",
    id: "branch-tvm-02",
    name: "Trivandrum Branch",
    shortName: "Trivandrum",
    ifscCode: "FLOW0001002",
    city: "Trivandrum",
    district: "Thiruvananthapuram",
    state: "Kerala",
    pincode: "695001",
    address: "Flowly Square, Statue Junction, Trivandrum - 695001",
    contactPhone: "+91 471 247 9002",
    color: "#0284C7", // Sky Blue
  },
  {
    code: "KOZHIKODE",
    id: "branch-clt-03",
    name: "Kozhikode Branch",
    shortName: "Kozhikode",
    ifscCode: "FLOW0001003",
    city: "Kozhikode",
    district: "Kozhikode",
    state: "Kerala",
    pincode: "673004",
    address: "Flowly Heights, Mavoor Road, Kozhikode - 673004",
    contactPhone: "+91 495 272 9003",
    color: "#059669", // Emerald
  },
];

/**
 * Resolves a branch by name, shortName, code, or IFSC.
 * Returns standardized branch object or a fallback with known branch details.
 */
export const resolveBranch = (branchInput = "", ifscInput = "") => {
  const query = String(branchInput || "").trim().toLowerCase();
  const ifsc = String(ifscInput || "").trim().toUpperCase();

  // Try direct match by IFSC
  if (ifsc) {
    const matched = SUPPORTED_BRANCHES.find((b) => b.ifscCode === ifsc);
    if (matched) return matched;
  }

  // Try matching branch query
  if (query) {
    if (query.includes("kochi") || query === "kochi" || query.includes("ernakulam")) {
      return SUPPORTED_BRANCHES[0];
    }
    if (query.includes("trivandrum") || query === "trivandrum" || query.includes("thiruvananthapuram")) {
      return SUPPORTED_BRANCHES[1];
    }
    if (query.includes("kozhikode") || query === "kozhikode" || query.includes("calicut")) {
      return SUPPORTED_BRANCHES[2];
    }
  }

  // Fallback to Kochi Main Branch if unspecified
  return SUPPORTED_BRANCHES[0];
};

/**
 * Validates if a branch identifier belongs to one of the 3 supported branches.
 */
export const isSupportedBranch = (branchInput = "", ifscInput = "") => {
  const query = String(branchInput || "").trim().toLowerCase();
  const ifsc = String(ifscInput || "").trim().toUpperCase();

  if (ifsc && SUPPORTED_BRANCHES.some((b) => b.ifscCode === ifsc)) {
    return true;
  }

  return (
    query.includes("kochi") ||
    query.includes("trivandrum") ||
    query.includes("kozhikode") ||
    query.includes("calicut") ||
    query.includes("thiruvananthapuram")
  );
};

export default {
  SUPPORTED_BRANCHES,
  resolveBranch,
  isSupportedBranch,
};
