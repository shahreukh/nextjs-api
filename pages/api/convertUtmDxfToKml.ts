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

const utmProjection = "+proj=utm +zone=37 +datum=WGS84 +units=m +no_defs"; // Replace with your UTM projection parameters
const wgs84Projection = "+proj=longlat +datum=WGS84"; // WGS84 projection

const utmToWgs84 = (utmCoordinates) => {
  const utmPoint = proj4(utmProjection, wgs84Projection, utmCoordinates);
  return {
    latitude: utmPoint[1], // Latitude is the second value in the array
    longitude: utmPoint[0], // Longitude is the first value in the array
  };
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
      let dxfFilePath = null;

      try {
        if (!req.file) {
          return res.status(400).json({ error: "No DXF file uploaded." });
        }

        dxfFilePath = req.file.path;
        temporaryKmlFilePath = `uploads/temp.kml`;

        const ogr2ogrCommand = `ogr2ogr -f "KML" ${temporaryKmlFilePath} ${dxfFilePath} -t_srs "32637"`;

        await execPromise(ogr2ogrCommand);
        console.log("DDD", temporaryKmlFilePath);
        const convertedKml = await fsPromises.readFile(
          temporaryKmlFilePath,
          "utf-8"
        );
        console.log("why", convertedKml);
        // Correctly parse and convert UTM coordinates to WGS84
        const updatedKml = convertedKml.replace(
          /<coordinates>(.*?)<\/coordinates>/g,
          (match, coordinates) => {
            const coordinateStrings = coordinates
              .split(" ")
              .map((coordString) => {
                const [x, y, z] = coordString.split(",");
                const utmCoordinates = [parseFloat(x), parseFloat(y)];
                const wgs84Coordinates = utmToWgs84(utmCoordinates);
                return `${wgs84Coordinates.longitude},${
                  wgs84Coordinates.latitude
                },${z || "0"},`;
              });

            // Join the coordinates with spaces and add a comma separator
            return `<coordinates>${coordinateStrings.join(" ")}</coordinates>`;
          }
        );

        res.setHeader("Content-Type", "application/xml");
        res.status(200).send(updatedKml);
        console.log(updatedKml);
        await fsPromises.unlink(dxfFilePath);
      } catch (error) {
        console.error("Error:", error);
        return res.status(500).json({ error: "An error occurred." });
      } finally {
        if (temporaryKmlFilePath) {
          try {
            await fsPromises.unlink(temporaryKmlFilePath);
          } catch (unlinkError) {
            console.error("Error removing temporary KML file:", unlinkError);
          }
        }
        if (dxfFilePath) {
          try {
            await fsPromises.unlink(dxfFilePath);
          } catch (unlinkError) {
            console.error("Error removing DXF file:", unlinkError);
          }
        }
      }
    });
  });
};

export default handleApiRequest;
