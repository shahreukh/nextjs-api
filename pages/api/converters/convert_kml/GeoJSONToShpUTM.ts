import { NextApiRequest, NextApiResponse } from "next";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import archiver from "archiver";

const flattenGeometryCollection = (geometryCollection) => {
  if (
    geometryCollection.type === "GeometryCollection" &&
    geometryCollection.geometries
  ) {
    const polygons = geometryCollection.geometries.map((geometry) => {
      if (geometry.type === "Polygon") {
        return geometry.coordinates;
      }
      return null; // Skip other geometry types for simplicity
    });

    return {
      type: "MultiPolygon",
      coordinates: polygons.filter((polygon) => polygon !== null),
    };
  }

  return geometryCollection;
};

const findUTMZoneFromGeoJSON = (geojson) => {
  if (geojson && geojson.features && geojson.features.length > 0) {
    const firstFeature = geojson.features[0];
    const firstCoordinates = getFirstCoordinates(firstFeature.geometry);

    if (firstCoordinates) {
      const longitude = firstCoordinates[0];
      const latitude = firstCoordinates[1];
      const utmZone = Math.floor((longitude + 180) / 6) + 1;
      const hemisphereIndicator = latitude >= 0 ? "6" : "7";

      return `EPSG:32${hemisphereIndicator}${
        utmZone > 9 ? utmZone : "0" + utmZone
      }`;
    }
  }

  return "EPSG:32737"; // Default to a common UTM zone if unable to determine
};

const getFirstCoordinates = (geometry) => {
  if (geometry && geometry.coordinates) {
    if (geometry.type === "Point") {
      return geometry.coordinates;
    } else if (
      geometry.type === "LineString" ||
      geometry.type === "MultiPoint"
    ) {
      return geometry.coordinates[0];
    } else if (
      geometry.type === "Polygon" ||
      geometry.type === "MultiLineString"
    ) {
      return geometry.coordinates[0][0];
    } else if (geometry.type === "MultiPolygon") {
      return geometry.coordinates[0][0][0];
    }
  }

  return null;
};

const handleSHPDataUTM = async (req: NextApiRequest, res: NextApiResponse) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method === "POST") {
    try {
      const { kmlData } = req.body;

      const flattenedGeoJson = {
        ...kmlData,
        features: kmlData.features.map((feature) => ({
          ...feature,
          geometry: flattenGeometryCollection(feature.geometry),
        })),
      };

      const geoJsonString = JSON.stringify(flattenedGeoJson);
      console.log(geoJsonString);

      const uploadsDirectory = path.join(process.cwd(), "uploads_shp");
      if (!fs.existsSync(uploadsDirectory)) {
        fs.mkdirSync(uploadsDirectory);
      }

      const targetEPSG = findUTMZoneFromGeoJSON(kmlData);
      console.log(targetEPSG);
      const ogr2ogr = spawn("ogr2ogr", [
        "-f",
        "ESRI Shapefile",
        "-t_srs",
        targetEPSG,
        path.join(uploadsDirectory, "output.shp"),
        "/vsistdin/",
      ]);

      console.log("ogr2ogr command:", ogr2ogr.spawnargs.join(" "));

      ogr2ogr.stdin.write(geoJsonString);
      ogr2ogr.stdin.end();

      ogr2ogr.on("close", (code) => {
        if (code === 0) {
          console.log("ogr2ogr process completed successfully.");

          const archive = archiver("zip", {
            zlib: { level: 9 },
          });

          archive.pipe(res);

          archive.file(path.join(uploadsDirectory, "output.shp"), {
            name: "output.shp",
          });
          archive.file(path.join(uploadsDirectory, "output.shx"), {
            name: "output.shx",
          });
          archive.file(path.join(uploadsDirectory, "output.dbf"), {
            name: "output.dbf",
          });
          archive.file(path.join(uploadsDirectory, "output.prj"), {
            name: "output.prj",
          });

          archive.finalize();

          archive.on("finish", () => {
            fs.unlinkSync(path.join(uploadsDirectory, "output.shp"));
            fs.unlinkSync(path.join(uploadsDirectory, "output.shx"));
            fs.unlinkSync(path.join(uploadsDirectory, "output.dbf"));
            fs.unlinkSync(path.join(uploadsDirectory, "output.prj"));
          });
        } else {
          console.error("ogr2ogr process exited with code", code);
          res.status(500).json({ error: "Failed to convert GeoJSON to SHP." });
        }
      });
    } catch (error) {
      console.error("Error while processing GeoJSON data:", error);
      res.status(500).json({ error: "Failed to process GeoJSON data." });
    }
  } else {
    res.status(405).json({ error: "Method not allowed." });
  }
};

export default handleSHPDataUTM;
