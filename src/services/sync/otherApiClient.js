const axios = require("axios");
require("dotenv").config();

const client = axios.create({
  baseURL: process.env.MAIN_API_BASE_URL,
  timeout: 20000,
  headers: {
    "Authorization": `Bearer ${process.env.MAIN_API_KEY}`,
    "Content-Type": "application/json"
  }
});

function entityCandidates(entity) {
  if (entity === "book_types") {
    const candidates = [
      process.env.SYNC_BOOK_TYPES_ENTITY,
      "book_types",
      "boot_types",
    ].filter(Boolean);
    return [...new Set(candidates)];
  }
  return [entity];
}

// Assumption: main API supports ?updated_after=ISO_DATE
async function fetchEntities(entity, updatedAfter) {
  const params = {};
  if (updatedAfter) params.updated_after = updatedAfter.toISOString();

  const candidates = entityCandidates(entity);
  let lastError = null;

  for (const name of candidates) {
    try {
      const res = await client.get(`/sync/${name}`, { params });
      return res.data; // array
    } catch (err) {
      lastError = err;
      if (err?.response?.status !== 404) {
        throw err;
      }
    }
  }

  throw lastError || new Error(`Failed to fetch sync entity: ${entity}`);
}

module.exports = { fetchEntities };
