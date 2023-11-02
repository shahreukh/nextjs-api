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
  dest: "uploads/uploads_shp/",
  limits: {
    fileSize: 300 * 1024 * 1024,
  },
});

const execPromise = promisify(exec);

const handleApiRequest = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  corsMiddleware(req, res, async () => {
    upload.array("shpFiles")(req, res, async (err) => {
      if (err) {
        return res.status(400).json({ error: "File upload error." });
      }

      let shpFilePaths = [];

      try {
        if (!req.files || req.files.length === 0) {
          return res.status(400).json({ error: "No SHP files uploaded." });
        }

        for (const uploadedFile of req.files) {
          shpFilePaths.push(uploadedFile.path);

          const geoJSONFilePath = `uploads/uploads_shp/temp.geojson`;
          const ogr2ogrGeoJSONCommand = `ogr2ogr -f "GeoJSON" ${geoJSONFilePath} ${uploadedFile.path}`;

          await execPromise(ogr2ogrGeoJSONCommand);

          const convertedGeoJSON = await fsPromises.readFile(
            geoJSONFilePath,
            "utf-8"
          );

          res.setHeader("Content-Type", "application/json");
          res.status(200).send(convertedGeoJSON);

          await fsPromises.unlink(geoJSONFilePath);
        }

        for (const filePath of shpFilePaths) {
          await fsPromises.unlink(filePath);
        }
      } catch (error) {
        console.error("Error:", error);
        return res.status(500).json({ error: "An error occurred." });
      }
    });
  });
};

export default handleApiRequest;
