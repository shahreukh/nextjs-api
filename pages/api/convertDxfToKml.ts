import { NextApiRequest, NextApiResponse } from "next";
import multer from "multer";
import { exec } from "child_process";
import { promises as fsPromises } from "fs";
import cors from "cors";

const corsMiddleware = cors({
  origin: "*",
  methods: "POST",
  allowedHeaders: "Content-Type",
});

const upload = multer({ dest: "uploads/" });

const convertDxfToKml = async (req: NextApiRequest, res: NextApiResponse) => {
  corsMiddleware(req, res, async () => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No DXF file uploaded." });
      }

      const dxfFilePath = req.file.path;
      const kmlFilePath = `uploads/${req.file.originalname.replace(
        ".dxf",
        ".kml"
      )}`;

      const ogr2ogrCommand = `ogr2ogr -f "KML" ${kmlFilePath} ${dxfFilePath}`;

      exec(ogr2ogrCommand, async (error) => {
        if (error) {
          console.error("Error converting to KML:", error);
          return res
            .status(500)
            .json({ error: "Error converting DXF to KML." });
        }

        const convertedKml = await fsPromises.readFile(kmlFilePath, "utf-8");
        res.setHeader("Content-Type", "application/xml");
        res.status(200).send(convertedKml);
      });
    } catch (error) {
      console.error("Error:", error);
      return res.status(500).json({ error: "An error occurred." });
    }
  });
};

export const config = {
  api: {
    bodyParser: false,
  },
};

const handleApiRequest = async (req: NextApiRequest, res: NextApiResponse) => {
  corsMiddleware(req, res, async () => {
    if (req.method === "OPTIONS") {
      res.status(200).end();
    } else {
      await upload.single("dxfFile")(req, res, (err) => {
        if (err) {
          return res.status(400).json({ error: "File upload error." });
        }
        convertDxfToKml(req, res);
      });
    }
  });
};

export default handleApiRequest;
