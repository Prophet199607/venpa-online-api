const { FeatureAuthorPublisher, Author, Publisher, sequelize } = require("../../models");
const { Op } = require("sequelize");

/**
 * List — filter by ?type=author|publisher
 */
exports.list = async (req, res, next) => {
  try {
    const { type } = req.query;
    const page     = Math.max(1, parseInt(req.query.page)     || 1);
    const per_page = Math.max(1, parseInt(req.query.per_page) || 15);
    const limit    = Math.min(per_page, 200);
    const offset   = (page - 1) * limit;

    const where = {};
    if (type) where.type = type;

    const { count, rows } = await FeatureAuthorPublisher.findAndCountAll({
      where,
      include: [
        {
          model: Author,
          as: "author",
          attributes: ["id", "auth_code", "auth_name", "auth_image", "status"],
          required: false,
        },
        {
          model: Publisher,
          as: "publisher",
          attributes: ["id", "pub_code", "pub_name", "pub_image", "status"],
          required: false,
        },
      ],
      order: [["position", "ASC"]],
      limit,
      offset,
      distinct: true,
      col: "id",
    });

    return res.json({
      success: true,
      data: rows,
      pagination: {
        current_page: page,
        last_page: Math.ceil(count / limit) || 0,
        total: count,
        per_page: limit,
      },
    });
  } catch (e) {
    next(e);
  }
};

/**
 * Create
 * Body: { type: "author", code: "AUTH001" }
 *    OR { type: "publisher", code: "PUB001" }
 */
exports.create = async (req, res, next) => {
  try {
    const { type, code } = req.body;

    if (!type || !["author", "publisher"].includes(type)) {
      return res.status(400).json({
        success: false,
        message: "type is required: 'author' or 'publisher'.",
      });
    }

    if (!code) {
      return res.status(400).json({ success: false, message: "code is required." });
    }

    // Validate code exists in the correct table
    if (type === "author") {
      const author = await Author.findOne({ where: { auth_code: code } });
      if (!author) {
        return res.status(404).json({
          success: false,
          message: `No author found with auth_code: ${code}`,
        });
      }
    } else {
      const publisher = await Publisher.findOne({ where: { pub_code: code } });
      if (!publisher) {
        return res.status(404).json({
          success: false,
          message: `No publisher found with pub_code: ${code}`,
        });
      }
    }

    const record = await sequelize.transaction(async (transaction) => {
      // Check duplicate
      const duplicate = await FeatureAuthorPublisher.findOne({
        where: { code, type },
        transaction,
      });
      if (duplicate) {
        throw Object.assign(new Error(`This ${type} (${code}) already exists.`), { status: 409 });
      }

      // Auto position per type
      const maxRow = await FeatureAuthorPublisher.findOne({
        attributes: [[sequelize.fn("MAX", sequelize.col("position")), "max_position"]],
        where: { type },
        raw: true,
        transaction,
      });
      const nextPosition = (maxRow?.max_position ?? 0) + 1;

      return FeatureAuthorPublisher.create(
        { code, type, position: nextPosition },
        { transaction }
      );
    });

    return res.json({
      success: true,
      message: `Feature ${type} created successfully.`,
      data: record,
    });
  } catch (e) {
    if (e.status) {
      return res.status(e.status).json({ success: false, message: e.message });
    }
    next(e);
  }
};

/**
 * Update — can include position reordering
 */
exports.update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { position } = req.body;

    const record = await FeatureAuthorPublisher.findByPk(id);
    if (!record) {
      return res.status(404).json({ success: false, message: "Record not found." });
    }

    if (position !== undefined && position !== null) {
      const newPosition = parseInt(position);
      if (isNaN(newPosition) || newPosition < 1) {
        return res.status(400).json({ success: false, message: "position must be a positive integer." });
      }

      await sequelize.transaction(async (transaction) => {
        const { type } = record;
        const oldPosition = record.position;

        if (oldPosition !== newPosition) {
          if (newPosition < oldPosition) {
            await FeatureAuthorPublisher.increment("position", {
              by: 1,
              where: {
                type,
                id:       { [Op.ne]: id },
                position: { [Op.gte]: newPosition, [Op.lt]: oldPosition },
              },
              transaction,
            });
          } else {
            await FeatureAuthorPublisher.increment("position", {
              by: -1,
              where: {
                type,
                id:       { [Op.ne]: id },
                position: { [Op.gt]: oldPosition, [Op.lte]: newPosition },
              },
              transaction,
            });
          }

          await record.update({ position: newPosition }, { transaction });
        }
      });
    }

    return res.json({
      success: true,
      message: "Record updated successfully.",
      data: record,
    });
  } catch (e) {
    next(e);
  }
};

/**
 * Delete — re-sequences per type
 */
exports.delete = async (req, res, next) => {
  try {
    let { ids } = req.body;
    if (ids && !Array.isArray(ids)) ids = [ids];

    if (!ids || !ids.length) {
      return res.status(400).json({ success: false, message: "ids is required." });
    }

    await sequelize.transaction(async (transaction) => {
      const existing = await FeatureAuthorPublisher.findAll({
        where: { id: { [Op.in]: ids } },
        attributes: ["id", "type"],
        transaction,
      });

      if (!existing.length) {
        return;
      }

      const affectedTypes = [...new Set(existing.map((r) => r.type))];
      const deletedCount = await FeatureAuthorPublisher.destroy({
        where: { id: { [Op.in]: ids } },
        transaction,
      });

      // Re-sequence per type
      for (const type of affectedTypes) {
        const remaining = await FeatureAuthorPublisher.findAll({
          where: { type },
          order: [["position", "ASC"]],
          attributes: ["id"],
          transaction,
        });
        for (let i = 0; i < remaining.length; i++) {
          await remaining[i].update({ position: i + 1 }, { transaction });
        }
      }
    });

    return res.json({
      success: true,
      message: `Record(s) deleted. Positions re-sequenced.`,
    });
  } catch (e) {
    next(e);
  }
};