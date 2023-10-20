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
  dest: "uploads_dxf/",
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
        return res.status(400).json({ error: "File upload error." });
      }

      let dxfFilePath = null;

      try {
        if (!req.file) {
          return res.status(400).json({ error: "No DXF file uploaded." });
        }

        dxfFilePath = req.file.path;

        const geoJSONFilePath = `uploads_dxf/temp.geojson`;
        const ogr2ogrGeoJSONCommand = `ogr2ogr -f "GeoJSON" ${geoJSONFilePath} ${dxfFilePath}`;
        await execPromise(ogr2ogrGeoJSONCommand);

        const convertedGeoJSON = await fsPromises.readFile(
          geoJSONFilePath,
          "utf-8"
        );

        res.setHeader("Content-Type", "application/json");
        res.status(200).send(convertedGeoJSON);

        await fsPromises.unlink(dxfFilePath);
        await fsPromises.unlink(geoJSONFilePath);
      } catch (error) {
        console.error("Error:", error);
        return res.status(500).json({ error: "An error occurred." });
      }
    });
  });
};

export default handleApiRequest;
