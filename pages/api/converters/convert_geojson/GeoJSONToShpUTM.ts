import { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import archiver from "archiver";
import { spawn } from "child_process";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "50mb",
    },
  },
};

interface Geometry {
  type: string;
  coordinates: any;
}

interface Feature {
  type: string;
  geometry: Geometry;
  properties: any;
}

interface GeometryCollection {
  type: string;
  geometries: Geometry[];
}

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

  return "EPSG:32737";
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

const convertToShapefile = async (
  features,
  fileName,
  geometryType,
  epsgCode
) => {
  if (features.length === 0) {
    return;
  }

  const typeSpecificGeoJson = {
    type: "FeatureCollection",
    features,
  };

  const utmZone = findUTMZoneFromGeoJSON(typeSpecificGeoJson);

  const uploadsDirectory = path.join(process.cwd(), "uploads/uploads_shp");
  if (!fs.existsSync(uploadsDirectory)) {
    fs.mkdirSync(uploadsDirectory);
  }

  const ogr2ogrProcess = spawn("ogr2ogr", [
    "-f",
    "ESRI Shapefile",
    path.join(uploadsDirectory, `${fileName}_${epsgCode}.shp`),
    "/vsistdin/",
    "-t_srs",
    utmZone,
  ]);

  ogr2ogrProcess.stdin.write(JSON.stringify(typeSpecificGeoJson));
  ogr2ogrProcess.stdin.end();

  return new Promise<void>((resolve, reject) => {
    ogr2ogrProcess.on("close", (code) => {
      if (code === 0) {
        //console.log(`${fileName} conversion successful.`);
        resolve();
      } else {
        console.error(`${fileName} conversion failed with code ${code}`);
        reject(new Error(`Failed to convert ${fileName} to SHP.`));
      }
    });
  });
};

const handleSHPData = async (req: NextApiRequest, res: NextApiResponse) => {
  const uploadsDirectory = path.join(process.cwd(), "uploads/uploads_shp");

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Expose-Headers", "UTMZone"); // Set the UTMZone header

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method === "POST") {
    try {
      const { geoJsonData, fileName } = req.body;
      const epsgCode = findUTMZoneFromGeoJSON(geoJsonData).replace(":", "_");
      const flattenedGeoJson = geoJsonData;
      const pointFeatures = flattenedGeoJson.features.filter(
        (feature) => feature.geometry.type === "Point"
      );
      const lineFeatures = flattenedGeoJson.features.filter(
        (feature) => feature.geometry.type === "LineString"
      );
      const polygonFeatures = flattenedGeoJson.features.filter(
        (feature) => feature.geometry.type === "Polygon"
      );

      const utmZone = findUTMZoneFromGeoJSON(geoJsonData);
      await Promise.all([
        convertToShapefile(
          pointFeatures,
          `${fileName}_point`,
          "Point",
          epsgCode
        ),
        convertToShapefile(
          lineFeatures,
          `${fileName}_line`,
          "LineString",
          epsgCode
        ),
        convertToShapefile(
          polygonFeatures,
          `${fileName}_polygon`,
          "Polygon",
          epsgCode
        ),
      ]);

      // Create a ZIP stream
      const archive = archiver("zip", {
        zlib: { level: 9 },
      });

      archive.pipe(res);

      const shapefileFiles = [
        `${fileName}_point_${epsgCode}.shp`,
        `${fileName}_point_${epsgCode}.shx`,
        `${fileName}_point_${epsgCode}.dbf`,
        `${fileName}_point_${epsgCode}.prj`,
        `${fileName}_line_${epsgCode}.shp`,
        `${fileName}_line_${epsgCode}.shx`,
        `${fileName}_line_${epsgCode}.dbf`,
        `${fileName}_line_${epsgCode}.prj`,
        `${fileName}_polygon_${epsgCode}.shp`,
        `${fileName}_polygon_${epsgCode}.shx`,
        `${fileName}_polygon_${epsgCode}.dbf`,
        `${fileName}_polygon_${epsgCode}.prj`,
      ];

      shapefileFiles.forEach((file) => {
        const filePath = path.join(uploadsDirectory, file);

        if (fs.existsSync(filePath)) {
          archive.file(filePath, { name: file });
        } else {
          //  console.error(`File not found: ${filePath}`);
        }
      });

      // Finalize the ZIP archive
      archive.finalize();

      // Cleanup: Remove temporary files
      archive.on("end", () => {
        shapefileFiles.forEach((file) => {
          const filePath = path.join(uploadsDirectory, file);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        });
      });
      res.setHeader("UTMZone", utmZone);
    } catch (error) {
      console.error("Error while processing GeoJSON data:", error);
      res.status(500).json({ error: "Failed to process GeoJSON data." });
    }
  } else {
    res.status(405).json({ error: "Method not allowed." });
  }
};

export default handleSHPData;
