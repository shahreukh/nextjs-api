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

const utmToWgs84 = (coordinates) => {
  // Define the UTM and WGS84 coordinate systems
  const utmProjection = "+proj=utm +33 +ellps=WGS84";
  const wgs84Projection = "+proj=longlat +datum=WGS84";

  // Convert UTM to WGS84
  return proj4(utmProjection, wgs84Projection, coordinates);
};

const handleApiRequest = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  corsMiddleware(req, res, async () => {
    await upload.single("dxfFile")(req, res, async (err) => {
      if (err) {
        return res.status(400).json({ error: "File upload error." });
      }

      let temporaryGeoJSONFilePath;

      try {
        if (!req.file) {
          return res.status(400).json({ error: "No DXF file uploaded." });
        }

        const dxfFilePath = req.file.path;
        temporaryGeoJSONFilePath = `uploads/temp.geojson`;

        const ogr2ogrCommand = `ogr2ogr -f "GeoJSON" ${temporaryGeoJSONFilePath} ${dxfFilePath}`;

        await execPromise(ogr2ogrCommand);

        const convertedGeoJSON = await fsPromises.readFile(
          temporaryGeoJSONFilePath,
          "utf-8"
        );

        // Parse the GeoJSON to modify the coordinates
        const geoJsonObject = JSON.parse(convertedGeoJSON);
        if (geoJsonObject.geometry && geoJsonObject.geometry.coordinates) {
          geoJsonObject.geometry.coordinates =
            geoJsonObject.geometry.coordinates.map((coordinates) =>
              utmToWgs84(coordinates)
            );
        }

        // Convert the modified GeoJSON back to a string
        const modifiedGeoJSON = JSON.stringify(geoJsonObject);

        res.setHeader("Content-Type", "application/json");
        res.status(200).send(modifiedGeoJSON);
        console.log("D", modifiedGeoJSON);
        await fsPromises.unlink(dxfFilePath);
        //console.log("Uploaded DXF file removed successfully.");
      } catch (error) {
        console.error("Error:", error);
        return res.status(500).json({ error: "An error occurred." });
      } finally {
        if (temporaryGeoJSONFilePath) {
          try {
            await fsPromises.unlink(temporaryGeoJSONFilePath);
            //console.log("Temporary GeoJSON file removed successfully.");
          } catch (unlinkError) {
            console.error(
              "Error removing temporary GeoJSON file:",
              unlinkError
            );
          }
        }
      }
    });
  });
};

export default handleApiRequest;
