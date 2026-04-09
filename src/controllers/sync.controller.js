const { syncAll, syncEntity, getSyncStatus } = require("../services/sync/syncService");

exports.syncAllNow = async (req, res, next) => {
  try {
    const full = req.query.full === "true";
    const results = await syncAll({ full });
    res.json({ ok: true, full, results });
  } catch (e) { next(e); }
};

exports.syncOne = async (req, res, next) => {
  try {
    const full = req.query.full === "true";
    const results = await syncEntity(req.params.entity, { full });
    res.json({ ok: true, full, results });
  } catch (e) { next(e); }
};

exports.getStatus = async (req, res, next) => {
  try {
    const status = await getSyncStatus();
    res.json({ ok: true, status });
  } catch (e) { next(e); }
};
