# Airport Data Generator APIs

The Airport Surface Generator API is a Node.js application designed to generate Enhanced Takeoff Flight Path Area and eTOD Areas for airports. This data is used for flight simulation and planning purposes. The API accepts POST requests with specific input parameters, runs a Python script to generate the eTOD data, and returns the results in Keyhole Markup Language (KML) format.

## Prerequisites

- Node.js and npm installed on your machine.
- Python 3.x installed on your machine.
- Required Python libraries: shapely, geopandas, pyproj, fiona.

## Installation

1. Clone this repository to your local machine.

```bash
git clone https://github.com/shahreukh/nextjs-api.git
```

2. Navigate to the project directory.

```bash
cd nextjs-api
```

3. Install the required Node.js packages.

```bash
npm install
```

## Usage

1. Start the server.

```bash
npm run dev

or

npm run build
npm start
```

2. Send a POST request to the API endpoint with the required input parameters. The API expects the following parameters in the request body:

- `airportCode`: Airport code.
- Various coordinates and parameters required for eTOD generation.

Example POST request using `curl`:

```bash
curl -X POST http://localhost:3000/api/generate-etod -H "Content-Type: application/json" -d '{
  "airportCode": "XYZ",
  "e1_lat": 37.12345,
  "e1_lon": -122.6789,
  "e1_elev": 300,
  "e1_rwy": "08L",
  "e2_lat": 37.54321,
  "e2_lon": -122.9876,
  "e2_elev": 400,
  "e2_rwy": "26R",
  "r1e_lat": 37.13579,
  "r1e_lon": -122.9876,
  "r1e_elev": 350,
  "r2e_lat": 37.97531,
  "r2e_lon": -122.7654,
  "r2e_elev": 450,
  "arp_lat": 37.12345,
  "arp_lon": -122.9876,
  "cwy1": "09L",
  "cwy2": "27R",
  "runwayLength": 8000,
  "runwayWidth": 150,
  "strip_length": 10000,
  "strip_width": 300,
  "ref_elev": 200
}'
```

3. The API will execute the Python script (`generate_eTOD.py`) to generate eTOD data based on the input parameters.

4. If the generation is successful, the API will return a response with a `200 OK` status and the generated KML data in the response body.

## API Endpoints

### `POST /api/generate-etod`

Generates eTOD data for the provided airport and parameters.

#### Request Body

```json
{
  "airportCode": "XYZ",
  "e1_lat": 37.12345,
  "e1_lon": -122.6789,
  "e1_elev": 300,
  "e1_rwy": "08L",
  "e2_lat": 37.54321,
  "e2_lon": -122.9876,
  "e2_elev": 400,
  "e2_rwy": "26R",
  "r1e_lat": 37.13579,
  "r1e_lon": -122.9876,
  "r1e_elev": 350,
  "r2e_lat": 37.97531,
  "r2e_lon": -122.7654,
  "r2e_elev": 450,
  "arp_lat": 37.12345,
  "arp_lon": -122.9876,
  "cwy1": "09L",
  "cwy2": "27R",
  "runwayLength": 8000,
  "runwayWidth": 150,
  "strip_length": 10000,
  "strip_width": 300,
  "ref_elev": 200
}
```

#### Response

- `200 OK`: Successful generation. KML data is included in the response body.
- `400 Bad Request`: Invalid request body or parameters.
- `405 Method Not Allowed`: Invalid request method (only POST is allowed).
- `500 Server Error`: Internal server error during script execution.

## Configuration

- CORS (Cross-Origin Resource Sharing) is enabled to allow requests from any origin (`*`). You can modify this behavior by updating the `origin` field in the `cors` configuration object.

## eTOD Surface Generator Python Script

Prerequisites
Python 3.x installed on your machine.
Required Python libraries: shapely, geopandas, pyproj, fiona.
Usage
Clone or download the script to your local machine.

Open a terminal or command prompt and navigate to the directory containing the script.

Run the script with the following command:

bash
Copy code
python etod_surface_generator.py [ICAO] [E1_LAT] [E1_LON] [E1_ELEV] [E1_RWY] [E2_LAT] [E2_LON] [E2_ELEV] [E2_RWY] [R1_LAT] [R1_LON] [R1_ELEV] [R2_LAT] [R2_LON] [R2_ELEV] [ARP_LAT] [ARP_LON] [CWY1] [CWY2] [RWY_LENGTH] [RWY_WIDTH] [STRIP_LENGTH] [STRIP_WIDTH] [REF_ELEV]

# Example command:

python etod_surface_generator.py KLAX 340048.62N 1182410.97W 131 25L 340037.71N 1182519.53W 131 7R 340052.32N 1182416.13W 131 340057.06N 1182514.03W 131 340046.62N 1182461.57W 305 300 150 10000 45 120 131
Replace the arguments with the appropriate values for your scenario.

Parameters
ICAO: ICAO code of the airport.
E1_LAT, E1_LON, E1_ELEV, E1_RWY: Threshold coordinates of the first runway end.
E2_LAT, E2_LON, E2_ELEV, E2_RWY: Threshold coordinates of the second runway end.
R1_LAT, R1_LON, R1_ELEV: Coordinates of the first runway strip reference point.
R2_LAT, R2_LON, R2_ELEV: Coordinates of the second runway strip reference point.
ARP_LAT, ARP_LON: Coordinates of the aerodrome reference point.
CWY1, CWY2: Length of the clearway for each runway end.
RWY_LENGTH, RWY_WIDTH: Length and width of the runway.
STRIP_LENGTH, STRIP_WIDTH: Length and width of the strip.
REF_ELEV: Reference elevation of the aerodrome for the inner horizontal surface.
Output
The script generates eTOD surfaces compliant with Annex 15 specifications. The surfaces are exported as KML files, which can be used for visualization and analysis in various GIS tools.
