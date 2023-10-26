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
  dest: "uploads/uploads_dgn",
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
    upload.array("dgnFiles")(req, res, async (err) => {
      if (err) {
        console.log("File upload error:", err);
        return res.status(400).json({ error: "File upload error." });
      }
      const zone = req.body.selectedZoneDgn;
      const hemisphere = req.body.selectedHemisphereDgn;
      let temporaryGeoJSONFilePaths = [];
      let dgnFilePaths = [];

      function getEPSGCode(zone: number, hemisphere: "N" | "S"): number {
        const baseEPSG = hemisphere === "N" ? 326 : 327;
        const epsgCode = baseEPSG + zone;
        return epsgCode;
      }

      const epsgCode = getEPSGCode(zone, hemisphere);
      const geoJSONData = [];

      try {
        if (!req.files || req.files.length === 0) {
          console.log("No DGN files uploaded.");
          return res.status(400).json({ error: "No DGN files uploaded." });
        }

        for (const file of req.files) {
          dgnFilePaths.push(file.path);
          temporaryGeoJSONFilePaths.push(
            `uploads/uploads_dgn/temp_${Date.now()}.geojson`
          );

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

        dgnFilePaths.forEach(async (dgnFilePath) => {
          try {
            await fsPromises.unlink(dgnFilePath);
          } catch (unlinkError) {
            console.error("Error removing DGN file:", unlinkError);
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
