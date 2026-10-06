const { MediaAsset, Language } = require("../../models");
const { uploadToS3 } = require("../../utils/s3");

/**
 * Handle base64 image strings and upload to S3. Return the key/URL.
 */
async function processImage(imageValue, keyForSlug) {
  if (!imageValue) return null;
  if (typeof imageValue === "string" && imageValue.startsWith("data:")) {
    const slug = (keyForSlug || "asset")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "_");
    return await uploadToS3(imageValue, "media-assets", slug);
  }
  return imageValue;
}

/**
 * Append full image URLs and language info to a plain JSON object.
 */
function formatItem(json) {
  const baseUrl = process.env.PRODUCT_IMAGE_BASE_URL;
  if (json.image && !json.image.startsWith("http")) {
    json.image = `${baseUrl}${json.image}`;
  }
  if (json.mobile_image && !json.mobile_image.startsWith("http")) {
    json.mobile_image = `${baseUrl}${json.mobile_image}`;
  }
  // Flatten language details
  if (json.languageDetails) {
    json.language_code = json.languageDetails.lang_code || null;
    json.language_name = json.languageDetails.lang_name || null;
    delete json.languageDetails;
  } else {
    json.language_code = json.language || null;
    json.language_name = null;
  }
  return json;
}

exports.listCarousels = async (req, res, next) => {
  try {
    const { placement_key, is_active } = req.query;
    const where = { type: "carousel" };

    if (placement_key) where.placement_key = placement_key;
    if (is_active !== undefined) {
      where.is_active = is_active === "true" || is_active === "1";
    }

    const items = await MediaAsset.findAll({
      where,
      include: [
        {
          model: Language,
          as: "languageDetails",
          attributes: ["lang_code", "lang_name"],
          required: false,
        },
      ],
      order: [["position", "ASC"]],
    });

    const formattedItems = items.map((item) => {
      const json = item.toJSON ? item.toJSON() : item;
      return formatItem(json);
    });

    res.json(formattedItems);
  } catch (e) {
    next(e);
  }
};

exports.createCarousel = async (req, res, next) => {
  try {
    const {
      image,
      mobile_image,
      orientation,
      placement_key,
      position,
      link,
      language,
      is_active,
    } = req.body;

    if ((!image && !mobile_image) || !placement_key) {
      return res.status(400).json({
        message: "image or mobile_image and placement_key are required",
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
      type: "carousel",
      orientation,
      placement_key,
      position: position || 0,
      link,
      language: language || null,
      is_active: is_active ?? true,
      created_at: new Date(),
      updated_at: new Date(),
    });

    // Re-fetch with language join to return consistent shape
    const created = await MediaAsset.findByPk(item.id, {
      include: [
        {
          model: Language,
          as: "languageDetails",
          attributes: ["lang_code", "lang_name"],
          required: false,
        },
      ],
    });

    const json = created.toJSON ? created.toJSON() : created;
    res.status(201).json(formatItem(json));
  } catch (e) {
    next(e);
  }
};

exports.updateCarousel = async (req, res, next) => {
  try {
    const item = await MediaAsset.findOne({
      where: { id: req.params.id, type: "carousel" },
    });
    if (!item) return res.status(404).json({ message: "Carousel not found" });

    const updateData = { ...req.body };

    // Process image updates if provided (only if they are base64)
    if (updateData.image && updateData.image.startsWith("data:")) {
      const key = updateData.placement_key || item.placement_key;
      updateData.image = await processImage(updateData.image, key);
    }

    if (
      updateData.mobile_image &&
      updateData.mobile_image.startsWith("data:")
    ) {
      const key = updateData.placement_key || item.placement_key;
      updateData.mobile_image = await processImage(
        updateData.mobile_image,
        key,
      );
    }

    // Allow explicitly clearing language by passing null/empty string
    if ("language" in updateData) {
      updateData.language = updateData.language || null;
    }

    await item.update({
      ...updateData,
      updated_at: new Date(),
    });

    // Re-fetch with language join to return consistent shape
    const updated = await MediaAsset.findByPk(item.id, {
      include: [
        {
          model: Language,
          as: "languageDetails",
          attributes: ["lang_code", "lang_name"],
          required: false,
        },
      ],
    });

    const json = updated.toJSON ? updated.toJSON() : updated;
    res.json(formatItem(json));
  } catch (e) {
    next(e);
  }
};

exports.deleteCarousel = async (req, res, next) => {
  try {
    const item = await MediaAsset.findOne({
      where: { id: req.params.id, type: "carousel" },
    });
    if (!item) return res.status(404).json({ message: "Carousel not found" });

    await item.destroy();
    res.json({ message: "Carousel deleted" });
  } catch (e) {
    next(e);
  }
};
