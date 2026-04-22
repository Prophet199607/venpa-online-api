const { MediaAsset } = require("../../models");
const { uploadToS3 } = require("../../utils/s3");

/**
 * Handle base64 image strings and upload to S3. Return the key/URL.
 */
async function processImage(imageValue, orientation, placement_key) {
  if (!imageValue) return null;
  if (typeof imageValue === "string" && imageValue.startsWith("data:")) {
    const slug = (placement_key || orientation || "banner")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "_");
    return await uploadToS3(imageValue, "media-assets", slug);
  }
  return imageValue;
}

exports.listBanners = async (req, res, next) => {
  try {
    const { orientation, placement_key, is_active } = req.query;
    const where = { type: "banner" };

    if (orientation) where.orientation = orientation;
    if (placement_key) where.placement_key = placement_key;
    if (is_active !== undefined) {
      where.is_active = is_active === "true" || is_active === "1";
    }

    const items = await MediaAsset.findAll({
      where,
      order: [["position", "ASC"]],
    });

    const baseUrl = process.env.PRODUCT_IMAGE_BASE_URL;

    const formattedItems = items.map((item) => {
      const json = item.toJSON ? item.toJSON() : item;
      if (json.image && !json.image.startsWith("http")) {
        json.image = `${baseUrl}${json.image}`;
      }
      if (json.mobile_image && !json.mobile_image.startsWith("http")) {
        json.mobile_image = `${baseUrl}${json.mobile_image}`;
      }
      return json;
    });

    res.json(formattedItems);
  } catch (e) {
    next(e);
  }
};

exports.createBanner = async (req, res, next) => {
  try {
    // Process images (Upload to S3 if base64)
    const {
      image,
      mobile_image,
      orientation,
      placement_key,
      link,
      position,
      is_active,
    } = req.body;

    if (!image && !mobile_image) {
      return res.status(400).json({
        message: "image or mobile_image is required",
      });
    }

    const processedImage = await processImage(
      image,
      orientation,
      placement_key,
    );
    const processedMobileImage = mobile_image
      ? await processImage(mobile_image, orientation, placement_key)
      : null;

    const item = await MediaAsset.create({
      image: processedImage,
      mobile_image: processedMobileImage,
      type: "banner",
      orientation,
      placement_key,
      link,
      position: position || 0,
      is_active: is_active ?? true,
      created_at: new Date(),
      updated_at: new Date(),
    });

    const baseUrl = process.env.PRODUCT_IMAGE_BASE_URL;
    const json = item.toJSON ? item.toJSON() : item;
    if (json.image && !json.image.startsWith("http")) {
      json.image = `${baseUrl}${json.image}`;
    }
    if (json.mobile_image && !json.mobile_image.startsWith("http")) {
      json.mobile_image = `${baseUrl}${json.mobile_image}`;
    }

    res.status(201).json(json);
  } catch (e) {
    next(e);
  }
};

exports.updateBanner = async (req, res, next) => {
  try {
    const item = await MediaAsset.findOne({
      where: { id: req.params.id, type: "banner" },
    });
    if (!item) return res.status(404).json({ message: "Banner not found" });

    const updateData = { ...req.body };

    // Process image updates if provided (only if they are base64)
    if (updateData.image && updateData.image.startsWith("data:")) {
      updateData.image = await processImage(
        updateData.image,
        updateData.orientation || item.orientation,
        updateData.placement_key || item.placement_key,
      );
    }

    if (
      updateData.mobile_image &&
      updateData.mobile_image.startsWith("data:")
    ) {
      updateData.mobile_image = await processImage(
        updateData.mobile_image,
        updateData.orientation || item.orientation,
        updateData.placement_key || item.placement_key,
      );
    }

    await item.update({
      ...updateData,
      updated_at: new Date(),
    });

    const baseUrl = process.env.PRODUCT_IMAGE_BASE_URL;
    const json = item.toJSON ? item.toJSON() : item;
    if (json.image && !json.image.startsWith("http")) {
      json.image = `${baseUrl}${json.image}`;
    }
    if (json.mobile_image && !json.mobile_image.startsWith("http")) {
      json.mobile_image = `${baseUrl}${json.mobile_image}`;
    }

    res.json(json);
  } catch (e) {
    next(e);
  }
};

exports.deleteBanner = async (req, res, next) => {
  try {
    const item = await MediaAsset.findOne({
      where: { id: req.params.id, type: "banner" },
    });
    if (!item) return res.status(404).json({ message: "Banner not found" });

    await item.destroy();
    res.json({ message: "Banner deleted" });
  } catch (e) {
    next(e);
  }
};
