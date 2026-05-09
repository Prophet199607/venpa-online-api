const { WebsiteDetail } = require("../../models");
const { uploadToS3 } = require("../../utils/s3");

/**
 * Handle base64 image strings and upload to S3. Return the key/URL.
 */
async function processLogo(logo) {
  if (!logo || !logo.url) return logo;
  if (typeof logo.url === "string" && logo.url.startsWith("data:")) {
    const slug = (logo.type || "logo").toLowerCase().replace(/[^a-z0-9]/g, "_");
    const key = await uploadToS3(logo.url, "logos", slug);
    return { ...logo, url: key };
  }
  return logo;
}

/**
 * Ensures a field is an array, parsing it if it's a JSON string.
 */
function parseJsonField(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === "string") {
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }
  return [];
}

function formatLogoUrls(logos) {
  const logoArray = parseJsonField(logos);
  const baseUrl = process.env.PRODUCT_IMAGE_BASE_URL || "";
  return logoArray.map((logo) => {
    if (logo.url && !logo.url.startsWith("http") && !logo.url.startsWith("data:")) {
      return { ...logo, url: `${baseUrl}${logo.url}` };
    }
    return logo;
  });
}

exports.getDetails = async (req, res, next) => {
  try {
    let details = await WebsiteDetail.findOne();

    // If no details exist, return default structure or empty
    if (!details) {
      return res.json({
        status: "success",
        data: {
          email: "",
          phone: "",
          about_us: "",
          opening_hours: "",
          social_links: [],
          logos: [],
          locations: [],
          navbar_messages: [],
        },
      });
    }

    const data = details.toJSON ? details.toJSON() : details;
    data.social_links = parseJsonField(data.social_links);
    data.locations = parseJsonField(data.locations);
    data.navbar_messages = parseJsonField(data.navbar_messages);
    data.logos = formatLogoUrls(data.logos);

    res.json({
      status: "success",
      data: data,
    });
  } catch (error) {
    next(error);
  }
};

exports.updateDetails = async (req, res, next) => {
  try {
    const {
      email,
      phone,
      about_us,
      opening_hours,
      social_links,
      logos,
      locations,
      navbar_messages,
    } = req.body;

    const parsedSocialLinks = parseJsonField(social_links);
    const parsedLogos = parseJsonField(logos);
    const parsedLocations = parseJsonField(locations);
    const parsedNavbarMessages = parseJsonField(navbar_messages);

    // Process logos if they contain base64 data
    const processedLogos = await Promise.all(parsedLogos.map(processLogo));

    let details = await WebsiteDetail.findOne();

    if (details) {
      // Update existing
      await details.update({
        email,
        phone,
        about_us,
        opening_hours,
        social_links: parsedSocialLinks,
        logos: processedLogos,
        locations: parsedLocations,
        navbar_messages: parsedNavbarMessages,
      });
    } else {
      // Create new
      details = await WebsiteDetail.create({
        email,
        phone,
        about_us,
        opening_hours,
        social_links: parsedSocialLinks,
        logos: processedLogos,
        locations: parsedLocations,
        navbar_messages: parsedNavbarMessages,
      });
    }

    const data = details.toJSON ? details.toJSON() : details;
    data.social_links = parseJsonField(data.social_links);
    data.locations = parseJsonField(data.locations);
    data.navbar_messages = parseJsonField(data.navbar_messages);
    data.logos = formatLogoUrls(data.logos);

    res.json({
      status: "success",
      message: "Website details updated successfully",
      data: data,
    });
  } catch (error) {
    next(error);
  }
};
