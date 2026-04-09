const { MediaAsset } = require("../../models");
const { uploadToS3 } = require("../../utils/s3");

/**
 * Handle base64 image strings and upload to S3. Return the key/URL.
 */
async function processImage(imageValue, placementKey) {
  if (!imageValue) return null;
  if (typeof imageValue === "string" && imageValue.startsWith("data:")) {
    const slug = placementKey.toLowerCase().replace(/[^a-z0-9]/g, "_");
    return await uploadToS3(imageValue, "media-assets", slug);
  }
  return imageValue;
}

exports.listMediaAssets = async (req, res, next) => {
  try {
    const { type, placement_key, is_active } = req.query;
    const where = {};

    if (type) where.type = type;
    if (placement_key) where.placement_key = placement_key;
    if (is_active !== undefined) {
      where.is_active = is_active === "true" || is_active === "1";
    }

    const items = await MediaAsset.findAll({
      where,
      order: [["position", "ASC"]],
    });

    const baseUrl =
      process.env.PRODUCT_IMAGE_BASE_URL ||
      "https://venpaa-v2.s3.ap-southeast-1.amazonaws.com/";

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

exports.createMediaAsset = async (req, res, next) => {
  try {
    const {
      image,
      mobile_image,
      type,
      placement_key,
      position,
      link,
      is_active,
    } = req.body;

    if ((!image && !mobile_image) || !type || !placement_key) {
      return res.status(400).json({
        message: "image or mobile_image, type and placement_key are required",
      });
    }

    // Process images (Upload to S3 if base64)
    const processedImage = await processImage(image, placement_key);
    const processedMobileImage = mobile_image
      ? await processImage(mobile_image, placement_key)
      : null;

    const item = await MediaAsset.create({
      image: processedImage,
      mobile_image: processedMobileImage,
      type,
      placement_key,
      position: position || 0,
      link,
      is_active: is_active ?? true,
      created_at: new Date(),
      updated_at: new Date(),
    });

    const baseUrl =
      process.env.PRODUCT_IMAGE_BASE_URL ||
      "https://venpaa-v2.s3.ap-southeast-1.amazonaws.com/";
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

exports.getMediaAssetById = async (req, res, next) => {
  try {
    const item = await MediaAsset.findByPk(req.params.id);
    if (!item)
      return res.status(404).json({ message: "Media asset not found" });

    const baseUrl =
      process.env.PRODUCT_IMAGE_BASE_URL ||
      "https://venpaa-v2.s3.ap-southeast-1.amazonaws.com/";
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

exports.updateMediaAsset = async (req, res, next) => {
  try {
    const item = await MediaAsset.findByPk(req.params.id);
    if (!item)
      return res.status(404).json({ message: "Media asset not found" });

    const updateData = { ...req.body };

    // Process image updates if provided
    if (updateData.image) {
      const key = updateData.placement_key || item.placement_key;
      updateData.image = await processImage(updateData.image, key);
    }

    if (updateData.mobile_image) {
      const key = updateData.placement_key || item.placement_key;
      updateData.mobile_image = await processImage(
        updateData.mobile_image,
        key,
      );
    }

    await item.update({
      ...updateData,
      updated_at: new Date(),
    });

    const baseUrl =
      process.env.PRODUCT_IMAGE_BASE_URL ||
      "https://venpaa-v2.s3.ap-southeast-1.amazonaws.com/";
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

exports.deleteMediaAsset = async (req, res, next) => {
  try {
    const item = await MediaAsset.findByPk(req.params.id);
    if (!item)
      return res.status(404).json({ message: "Media asset not found" });

    await item.destroy();
    res.json({ message: "Media asset deleted" });
  } catch (e) {
    next(e);
  }
};
