import { NextApiRequest, NextApiResponse } from "next";
import { spawn, ChildProcess } from "child_process";
import Cors from "cors";

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
        console.log("Cors Error");
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
          cwy1,
          cwy2,
          tfpa_length,
          tfpa_inner_length,
          tfpa_div,
          tfpa_finalWidth,
          tfpa_slope,
        } = req.body;

        const pythonScriptPath = "external/pythonscripts/generate_TFPA.py";

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
          cwy1,
          cwy2,
          tfpa_length,
          tfpa_inner_length,
          tfpa_div,
          tfpa_finalWidth,
          tfpa_slope,
        ]);

        let scriptOutput = "";
        let scriptError = "";

        process.stdout?.on("data", (data: Buffer) => {
          scriptOutput += data.toString();
        });

        process.stderr?.on("data", (data: Buffer) => {
          scriptError += data.toString();
        });

        process.on("close", (code: number) => {
          if (code !== 0) {
            console.log("Error");
          } else {
            try {
              res.setHeader(
                "Content-Type",
                "application/vnd.google-earth.kml+xml"
              );

              res.status(200).send(scriptOutput);
              //console.log(scriptOutput);
            } catch (error) {
              console.log("Error");
            }
          }
        });
      } else {
        res.status(405).json({ error: "Method Not Allowed" });
      }
    })
    .catch((error: Error) => {
      console.error("CORS error:", error);
      res.status(500).json({ error: "Server Error" });
    });
}
