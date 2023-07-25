import { spawn, ChildProcess } from "child_process";
import Cors from "cors";
import { NextApiRequest, NextApiResponse } from "next";

const cors = Cors({
  origin: "*",
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  return new Promise<void>((resolve, reject) => {
    cors(req, res, (result: unknown) => {
      if (result instanceof Error) {
        reject(result);
      } else {
        resolve();
      }
    });
  })
    .then(() => {
      if (req.method === "POST") {
        const {
          airportCode,
          e1_lat,
          e1_lon,
          e1_elev,
          e1_rwy,
          e2_lat,
          e2_lon,
          e2_elev,
          e2_rwy,
          r1e_lat,
          r1e_lon,
          r1e_elev,
          r2e_lat,
          r2e_lon,
          r2e_elev,
          arp_lat,
          arp_lon,
          cwy1,
          cwy2,
          runwayLength,
          runwayWidth,
          strip_length,
          strip_width,
          ref_elev,
        } = req.body;

        const pythonScriptPath = "external/pythonscripts/generate_eTOD.py";

        const process: ChildProcess = spawn("python", [
          pythonScriptPath,
          airportCode,
          e1_lat,
          e1_lon,
          e1_elev,
          e1_rwy,
          e2_lat,
          e2_lon,
          e2_elev,
          e2_rwy,
          r1e_lat,
          r1e_lon,
          r1e_elev,
          r2e_lat,
          r2e_lon,
          r2e_elev,
          arp_lat,
          arp_lon,
          cwy1,
          cwy2,
          runwayLength,
          runwayWidth,
          strip_length,
          strip_width,
          ref_elev,
        ]);

        let scriptOutput = "";
        let scriptError = "";

        process.stdout?.on("data", (data: Buffer) => {
          scriptOutput += data.toString();
        });

        process.stderr?.on("data", (data: Buffer) => {
          scriptError += data.toString();
        });

        process.on("close", (code) => {
          if (code !== 0) {
            // Error handling code...
          } else {
            try {
              // Send the KML data as the response
              res.setHeader(
                "Content-Type",
                "application/vnd.google-earth.kml+xml"
              );

              res.status(200).send(scriptOutput);
              console.log(scriptOutput);
            } catch (error) {
              // Error handling code...
            }
          }
        });
      } else {
        res.status(405).json({ error: "Method Not Allowed" });
      }
    })
    .catch((error) => {
      console.error("CORS error:", error);
      res.status(500).json({ error: "Server Error" });
    });
}
