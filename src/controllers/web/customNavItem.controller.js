const { Op } = require("sequelize");
const {
  CustomNavItem,
  Department,
  Category,
  SubCategory,
} = require("../../models");

function mapSubcategories(items) {
  return items.map((item) => ({
    scat_code: item.scat_code,
    scat_name: item.scat_name,
    department: item.department,
    cat_code: item.cat_code,
  }));
}

/**
 * Get all custom navigation items
 */
exports.list = async (req, res, next) => {
  try {
    const { item_type, status } = req.query;
    const where = {};

    if (item_type) {
      where.item_type = String(item_type).trim().toLowerCase();
    }

    if (status !== undefined) {
      const parsed = Number(status);
      where.status = Number.isNaN(parsed) ? status : parsed;
    }

    const menuItems = await CustomNavItem.findAll({
      where,
      order: [
        ["display_order", "ASC"],
        ["id", "ASC"],
      ],
    });

    const normalizedItems = menuItems
      .map((item) => ({
        id: item.id,
        item_type: String(item.item_type || "")
          .trim()
          .toLowerCase(),
        ref_code: String(item.ref_code || "").trim(),
        display_order: item.display_order,
        status: item.status,
      }))
      .filter(
        (item) =>
          ["department", "category"].includes(item.item_type) && item.ref_code,
      );

    const departmentCodes = [
      ...new Set(
        normalizedItems
          .filter((item) => item.item_type === "department")
          .map((item) => item.ref_code),
      ),
    ];
    const directCategoryCodes = normalizedItems
      .filter((item) => item.item_type === "category")
      .map((item) => item.ref_code);

    const topLevelDepartments = departmentCodes.length
      ? await Department.findAll({
          where: {
            dep_code: { [Op.in]: departmentCodes },
            status: 1,
          },
        })
      : [];

    const topLevelDepartmentMap = new Map(
      topLevelDepartments.map((item) => [item.dep_code, item]),
    );

    const departmentCategories = departmentCodes.length
      ? await Category.findAll({
          where: {
            department: { [Op.in]: departmentCodes },
            status: 1,
          },
          order: [["id", "ASC"]],
        })
      : [];

    const directCategories = directCategoryCodes.length
      ? await Category.findAll({
          where: {
            cat_code: { [Op.in]: directCategoryCodes },
            status: 1,
          },
          order: [["id", "ASC"]],
        })
      : [];

    const referencedDepartmentCodes = [
      ...new Set([
        ...departmentCodes,
        ...directCategories.map((item) => item.department),
      ]),
    ];

    const allReferencedDepartments = referencedDepartmentCodes.length
      ? await Department.findAll({
          where: {
            dep_code: { [Op.in]: referencedDepartmentCodes },
            status: 1,
          },
        })
      : [];

    const departmentMap = new Map(
      allReferencedDepartments.map((item) => [item.dep_code, item]),
    );

    const categoriesByDepartment = new Map();
    for (const item of departmentCategories) {
      if (!categoriesByDepartment.has(item.department)) {
        categoriesByDepartment.set(item.department, []);
      }
      categoriesByDepartment.get(item.department).push(item);
    }

    const allCategoryCodes = [
      ...new Set([
        ...departmentCategories.map((item) => item.cat_code),
        ...directCategories.map((item) => item.cat_code),
      ]),
    ];

    const allSubcategories = allCategoryCodes.length
      ? await SubCategory.findAll({
          where: {
            cat_code: { [Op.in]: allCategoryCodes },
            status: 1,
          },
          order: [["id", "ASC"]],
        })
      : [];

    const subcategoriesByCategory = new Map();
    for (const item of allSubcategories) {
      if (!subcategoriesByCategory.has(item.cat_code)) {
        subcategoriesByCategory.set(item.cat_code, []);
      }
      subcategoriesByCategory.get(item.cat_code).push(item);
    }

    const directCategoryMap = new Map(
      directCategories.map((item) => [item.cat_code, item]),
    );

    const items = normalizedItems
      .map((item) => {
        if (item.item_type === "department") {
          const department =
            topLevelDepartmentMap.get(item.ref_code) ||
            departmentMap.get(item.ref_code);
          if (!department) return null;

          const categories = (
            categoriesByDepartment.get(item.ref_code) || []
          ).map((category) => ({
            cat_code: category.cat_code,
            cat_name: category.cat_name,
            department: category.department,
            cat_image: category.cat_image,
            subcategories: mapSubcategories(
              subcategoriesByCategory.get(category.cat_code) || [],
            ),
          }));

          return {
            id: item.id,
            item_type: "department",
            ref_code: department.dep_code,
            title: department.dep_name,
            display_order: item.display_order,
            status: item.status,
            department: {
              dep_code: department.dep_code,
              dep_name: department.dep_name,
              dep_image: department.dep_image,
            },
            categories,
          };
        }

        const category = directCategoryMap.get(item.ref_code);
        if (!category) return null;

        const department =
          departmentMap.get(category.department) ||
          (typeof departments !== "undefined"
            ? departments.find((dep) => dep.dep_code === category.department)
            : null) ||
          null;

        return {
          id: item.id,
          item_type: "category",
          ref_code: category.cat_code,
          title: category.cat_name,
          display_order: item.display_order,
          status: item.status,
          category: {
            cat_code: category.cat_code,
            cat_name: category.cat_name,
            department: category.department,
            cat_image: category.cat_image,
          },
          department: department
            ? {
                dep_code: department.dep_code,
                dep_name: department.dep_name,
                dep_image: department.dep_image,
              }
            : null,
          subcategories: mapSubcategories(
            subcategoriesByCategory.get(category.cat_code) || [],
          ),
        };
      })
      .filter(Boolean);

    res.json({ items });
  } catch (e) {
    next(e);
  }
};

/**
 * Create or Bulk Update custom navigation items
 */
exports.create = async (req, res, next) => {
  try {
    const data = req.body;

    // Check if the payload is an array (Bulk Sync)
    if (Array.isArray(data)) {
      if (data.length === 0) {
        await CustomNavItem.destroy({ where: {}, truncate: true });
        return res.status(200).json({
          successful: true,
          message: "All navigation items removed.",
        });
      }

      // Traditional approach: replace all with new list to handle reordering/deletions
      await CustomNavItem.destroy({ where: {}, truncate: true });

      const mappedData = data.map((item) => ({
        item_type: String(item.item_type || "").toLowerCase(),
        ref_code: String(item.ref_code || ""),
        display_order: Number(item.display_order || 0),
        status: item.status !== undefined ? Number(item.status) : 1,
      }));

      const newItems = await CustomNavItem.bulkCreate(mappedData);

      return res.status(201).json({
        successful: true,
        message: "Navigation items synchronized successfully.",
        count: newItems.length,
      });
    }

    // Single item storage logic (Original)
    const { item_type, ref_code, display_order, status } = data;

    if (!item_type || !ref_code) {
      return res.status(400).json({
        successful: false,
        message: "Item type and reference code are required.",
      });
    }

    const newItem = await CustomNavItem.create({
      item_type: item_type.toLowerCase(),
      ref_code,
      display_order: Number(display_order || 1),
      status: status !== undefined ? Number(status) : 1,
    });

    res.status(201).json({
      successful: true,
      message: "Custom navigation item saved successfully.",
      data: newItem,
    });
  } catch (e) {
    res.status(500).json({
      successful: false,
      message: "Failed to save the custom navigation item.",
      error: e.message,
    });
  }
};
