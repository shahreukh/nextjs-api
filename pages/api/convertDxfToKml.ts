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

      let temporaryKmlFilePath;

      try {
        if (!req.file) {
          return res.status(400).json({ error: "No DXF file uploaded." });
        }

        const dxfFilePath = req.file.path;
        temporaryKmlFilePath = `uploads/temp.kml`;

        const ogr2ogrCommand = `ogr2ogr -f "KML" ${temporaryKmlFilePath} ${dxfFilePath}`;

        await execPromise(ogr2ogrCommand);

        const convertedKml = await fsPromises.readFile(
          temporaryKmlFilePath,
          "utf-8"
        );
        res.setHeader("Content-Type", "application/xml");
        res.status(200).send(convertedKml);

        await fsPromises.unlink(dxfFilePath);
        //console.log("Uploaded DXF file removed successfully.");
      } catch (error) {
        console.error("Error:", error);
        return res.status(500).json({ error: "An error occurred." });
      } finally {
        if (temporaryKmlFilePath) {
          try {
            await fsPromises.unlink(temporaryKmlFilePath);
            //console.log("Temporary KML file removed successfully.");
          } catch (unlinkError) {
            console.error("Error removing temporary KML file:", unlinkError);
          }
        }
      }
    });
  });
};

export default handleApiRequest;
