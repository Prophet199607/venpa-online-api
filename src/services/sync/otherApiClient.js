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

// Assumption: main API supports ?updated_after=ISO_DATE
async function fetchEntities(entity, updatedAfter) {
  const params = {};
  if (updatedAfter) params.updated_after = updatedAfter.toISOString();

  const res = await client.get(`/sync/${entity}`, { params });
  return res.data; // array
}

module.exports = { fetchEntities };
