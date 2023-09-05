import { NextApiRequest, NextApiResponse } from "next";
import multer from "multer";
import { promisify } from "util";
import { exec } from "child_process";
import { promises as fsPromises } from "fs";
import cors from "cors";
import proj4 from "proj4";

const corsMiddleware = cors({
  origin: "*",
  methods: "POST",
  allowedHeaders: "Content-Type",
});

const upload = multer({
  dest: "uploads/",
  limits: {
    fileSize: 300 * 1024 * 1024,
  },
});

const execPromise = promisify(exec);

export const config = {
  api: {
    bodyParser: false,
    responseLimit: false,
  },
};

const handleApiRequest = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  corsMiddleware(req, res, async () => {
    await upload.single("dxfFile")(req, res, async (err) => {
      if (err) {
        console.log("File upload error:", err);
        return res.status(400).json({ error: "File upload error." });
      }

      let temporaryKmlFilePath;
      let dxfFilePath = null;

      try {
        if (!req.file) {
          console.log("No DXF file uploaded.");
          return res.status(400).json({ error: "No DXF file uploaded." });
        }

        dxfFilePath = req.file.path;
        temporaryKmlFilePath = `uploads/temp.kml`;

        const ogr2ogrCommand = `ogr2ogr -f "KML" ${temporaryKmlFilePath} ${dxfFilePath} `;

        console.log("Running ogr2ogr command:", ogr2ogrCommand);

        await execPromise(ogr2ogrCommand);

        console.log("DDD", temporaryKmlFilePath);

        const kmlContent = await fsPromises.readFile(
          temporaryKmlFilePath,
          "utf-8"
        );
        console.log("Original KML:", kmlContent);

        // Parse and convert KML coordinates
        const convertedKml = convertKmlCoordinates(kmlContent);

        res.setHeader("Content-Type", "application/xml");
        res.status(200).send(convertedKml);
        console.log("Converted KML:", convertedKml);

        await fsPromises.unlink(dxfFilePath);
      } catch (error) {
        console.error("Error:", error);
        return res.status(500).json({ error: "An error occurred." });
      } finally {
        if (temporaryKmlFilePath) {
          try {
            await fsPromises.unlink(temporaryKmlFilePath);
            console.log("Temporary KML file removed.");
          } catch (unlinkError) {
            console.error("Error removing temporary KML file:", unlinkError);
          }
        }
        if (dxfFilePath) {
          try {
            await fsPromises.unlink(dxfFilePath);
            console.log("DXF file removed.");
          } catch (unlinkError) {
            console.error("Error removing DXF file:", unlinkError);
          }
        }
      }
    });
  });
};

function convertKmlCoordinates(kmlContent: string) {
  const convertedKml = kmlContent.replace(
    /<coordinates>(.*?)<\/coordinates>/g,
    (match, coordinates) => {
      // Add these log statements for debugging
      console.log("Coordinates before conversion:");
      console.log(coordinates);

      const coordinateStrings = coordinates
        .split(" ")
        .map((coordString: string) => {
          // Specify the type of coordString
          const [easting, northing, elevation] = coordString.split(",");
          console.log("Easting:", easting);
          console.log("Northing:", northing);
          console.log("Elevation:", elevation);

          const [lon, lat] = convertToWgs84(easting, northing); // Convert easting/northing to WGS84 lat/lon
          console.log("Lon:", lon);
          console.log("Lat:", lat);
          return `${lon},${lat},${elevation || "0"}`;
        });

      return `<coordinates>${coordinateStrings.join(" ")}</coordinates>`;
    }
  );

  return convertedKml;
}

proj4.defs(
  "EPSG:32737",
  "+proj=utm +zone=37 +south +datum=WGS84 +units=m +no_defs"
);

// Function to convert easting/northing to WGS84 lat/lon
function convertToWgs84(easting, northing) {
  const fromProjection = "EPSG:32737"; // Replace with the correct EPSG code
  const toProjection = "EPSG:4326"; // WGS84 projection

  try {
    // Parse easting and northing values as floats
    const eastingFloat = parseFloat(easting);
    const northingFloat = parseFloat(northing);

    if (isNaN(eastingFloat) || isNaN(northingFloat)) {
      throw new Error("Invalid easting or northing values.");
    }

    const result = proj4(fromProjection, toProjection, [
      eastingFloat,
      northingFloat,
    ]);
    return result;
  } catch (error) {
    console.error("Projection Error:", error);
    throw error;
  }
}

export default handleApiRequest;
