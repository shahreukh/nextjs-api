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
  dest: "uploads/",
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
    upload.array("dxfFiles")(req, res, async (err) => {
      if (err) {
        console.log("File upload error:", err);
        return res.status(400).json({ error: "File upload error." });
      }
      const zone = req.body.selectedZone;
      const hemisphere = req.body.selectedHemisphere;
      let temporaryGeoJSONFilePaths = [];
      let dxfFilePaths = [];

      function getEPSGCode(zone: number, hemisphere: "N" | "S"): number {
        const baseEPSG = hemisphere === "N" ? 326 : 327;
        const epsgCode = baseEPSG + zone;
        return epsgCode;
      }

      const epsgCode = getEPSGCode(zone, hemisphere);
      const geoJSONData = [];

      try {
        if (!req.files || req.files.length === 0) {
          console.log("No DXF files uploaded.");
          return res.status(400).json({ error: "No DXF files uploaded." });
        }

        for (const file of req.files) {
          dxfFilePaths.push(file.path);
          temporaryGeoJSONFilePaths.push(`uploads/temp_${Date.now()}.geojson`);

          const ogr2ogrCommand = `ogr2ogr -f "GeoJSON" -s_srs EPSG:${epsgCode} -t_srs EPSG:4326 ${
            temporaryGeoJSONFilePaths[temporaryGeoJSONFilePaths.length - 1]
          } ${file.path}`;

          await execPromise(ogr2ogrCommand);

          const geoJSONContent = await fsPromises.readFile(
            temporaryGeoJSONFilePaths[temporaryGeoJSONFilePaths.length - 1],
            {
              encoding: "utf-8",
            }
          );

          geoJSONData.push(JSON.parse(geoJSONContent));
        }

        temporaryGeoJSONFilePaths.forEach(async (geoJSONFilePath) => {
          try {
            await fsPromises.unlink(geoJSONFilePath);
          } catch (unlinkError) {
            console.error(
              "Error removing temporary GeoJSON file:",
              unlinkError
            );
          }
        });

        dxfFilePaths.forEach(async (dxfFilePath) => {
          try {
            await fsPromises.unlink(dxfFilePath);
          } catch (unlinkError) {
            console.error("Error removing DXF file:", unlinkError);
          }
        });

        res.setHeader("Content-Type", "application/json");
        res.status(200).send(geoJSONData);
      } catch (error) {
        console.error("Error:", error);
        return res.status(500).json({ error: "An error occurred." });
      }
    });
  });
};

export default handleApiRequest;
