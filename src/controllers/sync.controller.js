const { syncAll, syncEntity } = require("../services/sync/syncService");

exports.syncAllNow = async (req, res, next) => {
  try {
    const results = await syncAll();
    res.json({ ok: true, results });
  } catch (e) { next(e); }
};

exports.syncOne = async (req, res, next) => {
  try {
    const results = await syncEntity(req.params.entity);
    res.json({ ok: true, results });
  } catch (e) { next(e); }
};
