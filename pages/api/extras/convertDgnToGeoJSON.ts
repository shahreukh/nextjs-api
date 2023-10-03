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

const upload = multer({
  dest: "uploads/",
  limits: {
    fileSize: 300 * 1024 * 1024,
  },
});

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

  return corsMiddleware(req, res, async () => {
    try {
      upload.single("dgnFile")(req, res, async (err) => {
        if (err) {
          return res.status(400).json({ error: "File upload error." });
        }

        if (!req.file) {
          return res.status(400).json({ error: "No DGN file uploaded." });
        }

        const dgnFilePath = req.file.path;
        const temporaryGeoJSONFilePath = `uploads/temp.geojson`;

        const ogr2ogrCommand = `ogr2ogr -f "GeoJSON" ${temporaryGeoJSONFilePath} ${dgnFilePath}`;

        exec(ogr2ogrCommand, async (error) => {
          if (error) {
            console.error("Error converting to GeoJSON:", error);

            // Delete the uploaded DGN file
            try {
              await fsPromises.unlink(dgnFilePath);
              console.log("Uploaded DGN file removed due to conversion error.");
            } catch (unlinkError) {
              console.error("Error removing uploaded DGN file:", unlinkError);
            }

            return res
              .status(500)
              .json({ error: "Error converting DGN to GeoJSON." });
          }

          try {
            const convertedGeoJSON = await fsPromises.readFile(
              temporaryGeoJSONFilePath,
              "utf-8"
            );
            res.setHeader("Content-Type", "application/json");
            res.status(200).send(convertedGeoJSON);

            // Delete the uploaded DGN file
            try {
              await fsPromises.unlink(dgnFilePath);
              console.log("Uploaded DGN file removed successfully.");
            } catch (unlinkError) {
              console.error("Error removing uploaded DGN file:", unlinkError);
            }
          } catch (readError) {
            console.error("Error reading temporary GeoJSON file:", readError);
            return res.status(500).json({ error: "An error occurred." });
          } finally {
            // Delete the temporary GeoJSON file after reading or in case of an error
            try {
              await fsPromises.unlink(temporaryGeoJSONFilePath);
              console.log("Temporary GeoJSON file removed successfully.");
            } catch (unlinkError) {
              console.error(
                "Error removing temporary GeoJSON file:",
                unlinkError
              );
            }
          }
        });
      });
    } catch (error) {
      console.error("Error:", error);
      return res.status(500).json({ error: "An error occurred." });
    }
  });
};

export default handleApiRequest;
