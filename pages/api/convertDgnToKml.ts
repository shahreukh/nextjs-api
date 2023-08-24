import { NextApiRequest, NextApiResponse } from "next";
import multer from "multer";
import { exec } from "child_process";
import { promises as fsPromises } from "fs";
import cors from "cors";

const corsMiddleware = cors({
  origin: "*", // Replace with the allowed origin(s)
  methods: "POST",
  allowedHeaders: "Content-Type",
});

const upload = multer({ dest: "uploads/" });

const convertDgnToKml = async (req: NextApiRequest, res: NextApiResponse) => {
  return corsMiddleware(req, res, async () => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No DGN file uploaded." });
      }

      const dgnFilePath = req.file.path;
      const kmlFilePath = `uploads/${req.file.originalname.replace(
        ".dgn",
        ".kml"
      )}`;

      const ogr2ogrCommand = `ogr2ogr -f "KML" ${kmlFilePath} ${dgnFilePath}`;

      exec(ogr2ogrCommand, async (error) => {
        if (error) {
          console.error("Error converting to KML:", error);
          return res
            .status(500)
            .json({ error: "Error converting DGN to KML." });
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
  if (req.method === "OPTIONS") {
    res.status(200).end();
  } else {
    await upload.single("dgnFile")(req, res, (err) => {
      if (err) {
        return res.status(400).json({ error: "File upload error." });
      }
      convertDgnToKml(req, res);
    });
  }
};

export default handleApiRequest;
