import { NextApiRequest, NextApiResponse } from "next";
import multer from "multer";
import { promisify } from "util";
import { exec } from "child_process";
import { promises as fsPromises } from "fs";
import cors from "cors";

const corsMiddleware = cors({
  origin: "*",
  methods: "POST",
  allowedHeaders: "Content-Type",
});

const upload = multer({
  dest: "uploads/uploads_shp",
  limits: {
    fileSize: 50 * 1024 * 1024,
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
    await upload.array("shpFiles")(req, res, async (err) => {
      if (err) {
        console.log("File upload error:", err);
        return res.status(400).json({ error: "File upload error." });
      }
      const zone = req.body.selectedZone;
      const hemisphere = req.body.selectedHemisphere;
      let temporaryGeoJSONFilePath;
      let shpFilePath = null;
      function getEPSGCode(zone: number, hemisphere: "N" | "S"): number {
        const baseEPSG = hemisphere === "N" ? 326 : 327;

        const epsgCode = baseEPSG + zone;

        return epsgCode;
      }

      const epsgCode = getEPSGCode(zone, hemisphere);

      if (!req.file) {
        console.log("No Shp file uploaded.");
        return res.status(400).json({ error: "No Shp file uploaded." });
      }

      try {
        shpFilePath = req.file.path;
        temporaryGeoJSONFilePath = `uploads/temp.shp`;

        const ogr2ogrCommand = `ogr2ogr -f "GeoJSON" -s_srs EPSG:${epsgCode} -t_srs EPSG:4326 ${temporaryGeoJSONFilePath} ${shpFilePath}`;

        await execPromise(ogr2ogrCommand);

        const geoJSONContent = await fsPromises.readFile(
          temporaryGeoJSONFilePath,
          {
            encoding: "utf-8",
          }
        );

        res.setHeader("Content-Type", "application/json");
        res.status(200).send(geoJSONContent);
        console.log(geoJSONContent);
      } catch (error) {
        console.error("Error:", error);
        return res.status(500).json({ error: "An error occurred." });
      } finally {
        if (temporaryGeoJSONFilePath) {
          try {
            await fsPromises.unlink(temporaryGeoJSONFilePath);
          } catch (unlinkError) {
            console.error(
              "Error removing temporary GeoJSON file:",
              unlinkError
            );
          }
        }
        if (shpFilePath) {
          try {
            await fsPromises.unlink(shpFilePath);
          } catch (unlinkError) {
            console.error("Error removing Shp file:", unlinkError);
          }
        }
      }
    });
  });
};

export default handleApiRequest;
