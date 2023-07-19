# eTOD Surface Generator
from shapely.geometry import Polygon, LineString
from datetime import datetime
import geopandas as gpd
import pandas as pd
import tempfile
import pyproj
import fiona
import math
import sys
import os


fiona.supported_drivers['KML'] = 'rw'
fiona.supported_drivers['GeoJSON'] = 'rw'

# Inputs

# ICAO code of the airport
airport = sys.argv[1]

folder_name = "eTOD_Surfaces"  # Name of Export Folder

# Threshold Coordinates
e1_lat = sys.argv[2]
e1_lon = sys.argv[3]
e1_elev = float(sys.argv[4])
e1_rwy = sys.argv[5]

e2_lat = sys.argv[6]
e2_lon = sys.argv[7]
e2_elev = float(sys.argv[8])
e2_rwy = sys.argv[9]

r1_lat = sys.argv[10]
r1_lon = sys.argv[11]
r1_elev = float(sys.argv[12])

r2_lat = sys.argv[13]
r2_lon = sys.argv[14]
r2_elev = float(sys.argv[15])

e1 = [e1_lat, e1_lon, e1_elev, e1_rwy]
e2 = [e2_lat, e2_lon, e2_elev, e2_rwy]

r1e = [r1_lat, r1_lon, r1_elev]
r2e = [r2_lat, r2_lon, r2_elev]

arp_lat = sys.argv[16]
arp_lon = sys.argv[17]
arp = [arp_lat, arp_lon] #lat,lon -- arp coordinates in DDMMSS.SS format

cwy1 = float(sys.argv[18]) #length of the cwy of rwy1
cwy2 = float(sys.argv[19]) #length of the cwy of rwy2

runway_length = int(sys.argv[20]) 
runway_width = int(sys.argv[21])
runway = [runway_length, runway_width]

strip_length = int(sys.argv[22])
strip_width = int(sys.argv[23])
strip = [strip_length, strip_width]

#eTOD Surfaces Inputs

s_etod = 0.012
l_etod = 10000
r_etod = 45000
h_etod = 120
div_etod = 0.15
ref_elev = float(sys.argv[24]) #reference elevation of aerodrome for inner horizontal surface

# Create Surfaces
# Create Surfaces

def DDMMSS_to_UTM(lat, lon):
    lat_degrees = int(float(lat) / 10000)
    lat_minutes = int((float(lat) - lat_degrees * 10000) / 100)
    lat_seconds = float(lat) - lat_degrees * 10000 - lat_minutes * 100
    lat_decimal = lat_degrees + (lat_minutes / 60) + (lat_seconds / 3600)

    lon_degrees = int(float(lon) / 10000)
    lon_minutes = int((float(lon) - lon_degrees * 10000) / 100)
    lon_seconds = float(lon) - lon_degrees * 10000 - lon_minutes * 100
    lon_decimal = lon_degrees + (lon_minutes / 60) + (lon_seconds / 3600)

    utm_zone = int((lon_decimal + 180) / 6) + 1
    epsg_code = '326' + str(utm_zone)
    p = pyproj.Proj(init='epsg:' + epsg_code)
    utm_easting, utm_northing = p(lon_decimal, lat_decimal)
    return int(epsg_code), utm_easting, utm_northing

EPSG, e1[0], e1[1] = DDMMSS_to_UTM(e1[0], e1[1])
EPSG, e2[0], e2[1] = DDMMSS_to_UTM(e2[0], e2[1])

EPSG, r1e[0], r1e[1] = DDMMSS_to_UTM(r1e[0], r1e[1])
EPSG, r2e[0], r2e[1] = DDMMSS_to_UTM(r2e[0], r2e[1])

EPSG, arp[0], arp[1] = DDMMSS_to_UTM(arp[0], arp[1])

#sort thresholds
if e1[0] > e2[0]:
  t1 = e2 + r2e + [cwy2]
  t2 = e1 + r1e + [cwy1]

else:
  t1 = e1 + r1e + [cwy1]
  t2 = e2 + r2e + [cwy2]

t2.append(1)
t1.append(-1)

# Slope of center line in caresian coordinate system
m = (t2[1]-t1[1])/(t2[0]-t1[0])

# Angle between center line and x axis
alpha = math.atan(m)
azimuth = math.degrees(math.pi/2 - alpha)

# define function to calculate new point coordinates based on distance, azimuth, and slope
def calculate_new_point(x, y, z, distance, azimuth, slope, divergence):
    """
    Calculate new point coordinates based on distance, azimuth, and slope.

    Parameters
    ----------
    x : float
        X coordinate of starting point.
    y : float
        Y coordinate of starting point.
    distance : float
        Distance between starting point and new point.
    azimuth : float
        Azimuth angle from starting point to new point in degrees.
    slope : float
        Slope angle from starting point to new point in degrees.

    Returns
    -------
    tuple
        Tuple of X and Y coordinates of new point.
    """
    # convert angles to radians
    azimuth_rad = math.radians(azimuth)
    divergence_rad = math.atan(divergence)
    azimuth_divergence = azimuth_rad + divergence_rad

    inclined_distance = distance / math.cos(divergence_rad)

    # calculate new point coordinates
    x_new = x + (inclined_distance * math.sin(azimuth_divergence))
    y_new = y + (inclined_distance * math.cos(azimuth_divergence))
    z_new = z + (distance * slope)

    return x_new, y_new, z_new

arc_degree = 1

def points_on_arc(center, start, end, elevation, direction, degree_interval = arc_degree):
    radius = math.sqrt((center[0] - start[0]) ** 2 + (center[1] - start[1]) ** 2)
    start_angle = math.atan2(start[1] - center[1], start[0] - center[0])
    end_angle = math.atan2(end[1] - center[1], end[0] - center[0])

    if direction == "ccw":
        if end_angle <= start_angle:
            end_angle += 2 * math.pi
    else:
        if end_angle >= start_angle:
            end_angle -= 2 * math.pi

    num_points = int(abs(end_angle - start_angle) / math.radians(degree_interval)) + 1
    angle_increment = (end_angle - start_angle) / (num_points - 1)

    points = []
    for i in range(num_points):
        angle = start_angle + i * angle_increment
        x = center[0] + radius * math.cos(angle)
        y = center[1] + radius * math.sin(angle)
        points.append((x, y, elevation))

    return points


def create_strip(t1,t2,runway,strip,azimuth):

  w = strip[1]
  d = (strip[0] - runway[0])/2

  s1 = calculate_new_point(t1[4],t1[5],t1[6],w/2,azimuth-90,0,0)
  s2 = calculate_new_point(t1[4],t1[5],t1[6],d,azimuth,0,-w/2/d)
  s3 = calculate_new_point(t1[4],t1[5],t1[6],d,azimuth,0,w/2/d)
  s4 = calculate_new_point(t1[4],t1[5],t1[6],w/2,azimuth+90,0,0)

  s5 = calculate_new_point(t2[4],t2[5],t2[6],w/2,azimuth-180-90,0,0)
  s6 = calculate_new_point(t2[4],t2[5],t2[6],d,azimuth-180,0,-w/2/d)
  s7 = calculate_new_point(t2[4],t2[5],t2[6],d,azimuth-180,0,w/2/d)
  s8 = calculate_new_point(t2[4],t2[5],t2[6],w/2,azimuth-180+90,0,0)

  return [s1,s2,s3,s4,s5,s6,s7,s8,s1]

def area2a(t1,t2,runway,strip,azimuth):

  w = strip[1]
  d = (strip[0] - runway[0])/2
  if t1[7] > d:
    d1 = t1[7]
  else:
    d1 = d
  if t2[7] > d:
    d2 = t2[7]
  else:
    d2 = d

  a1 = calculate_new_point(t1[4],t1[5],t1[6],w/2,azimuth-90,0,0)
  a2 = calculate_new_point(t1[4],t1[5],t1[6],d1,azimuth,0,-w/2/d1)
  a3 = calculate_new_point(t1[4],t1[5],t1[6],d1,azimuth,0,w/2/d1)
  a4 = calculate_new_point(t1[4],t1[5],t1[6],w/2,azimuth+90,0,0)

  a5 = calculate_new_point(t2[4],t2[5],t2[6],w/2,azimuth-180-90,0,0)
  a6 = calculate_new_point(t2[4],t2[5],t2[6],d2,azimuth-180,0,-w/2/d2)
  a7 = calculate_new_point(t2[4],t2[5],t2[6],d2,azimuth-180,0,w/2/d2)
  a8 = calculate_new_point(t2[4],t2[5],t2[6],w/2,azimuth-180+90,0,0)

  return [a1,a2,a3,a4,a5,a6,a7,a8,a1]

def area2b(t1,t2,l,s,div,runway,strip,azimuth):

  w = strip[1]
  d = (strip[0] - runway[0])/2
  if t1[7] > d:
    d1 = t1[7]
  else:
    d1 = d
  if t2[7] > d:
    d2 = t2[7]
  else:
    d2 = d

  coordinates1 = []
  c11 = calculate_new_point(t1[4],t1[5],t1[6],d1,azimuth,0,-w/2/d1)
  b11 = calculate_new_point(c11[0],c11[1],c11[2],l,azimuth-math.degrees(math.atan(div)),s,0)
  b12 = calculate_new_point(c11[0],c11[1],c11[2],l,azimuth,s,0)

  coordinates1.append(c11)
  coordinates1 = coordinates1 + points_on_arc(c11, b11, b12, b11[2], "cw", 1)

  c21 = calculate_new_point(t1[4],t1[5],t1[6],d1,azimuth,0,w/2/d2)
  b21 = calculate_new_point(c21[0],c21[1],c21[2],l,azimuth,s,0)
  b22 = calculate_new_point(c21[0],c21[1],c21[2],l,azimuth+math.degrees(math.atan(div)),s,0)

  coordinates1 = coordinates1 + points_on_arc(c21, b21, b22, b21[2], "cw", 1)
  coordinates1.append(c21)

#################################

  coordinates2 = []
  c12 = calculate_new_point(t2[4],t2[5],t2[6],d2,azimuth-180,0,w/2/d1)
  b13 = calculate_new_point(c12[0],c12[1],c12[2],l,azimuth-180+math.degrees(math.atan(div)),s,0)
  b14 = calculate_new_point(c12[0],c12[1],c12[2],l,azimuth-180,s,0)

  coordinates2.append(c12)
  coordinates2 = coordinates2 + points_on_arc(c12, b13, b14, b13[2], "ccw", 1)

  c22 = calculate_new_point(t2[4],t2[5],t2[6],d2,azimuth-180,0,-w/2/d2)
  b23 = calculate_new_point(c22[0],c22[1],c22[2],l,azimuth-180,s,0)
  b24 = calculate_new_point(c22[0],c22[1],c22[2],l,azimuth-180-math.degrees(math.atan(div)),s,0)

  coordinates2 = coordinates2 + points_on_arc(c22, b23, b24, b23[2], "ccw", 1)
  coordinates2.append(c22)

  return coordinates1, coordinates2

def area2c(t1,t2,l,s,div,runway,strip,azimuth):

  w = strip[1]
  d = (strip[0] - runway[0])/2
  if t1[7] > d:
    d1 = t1[7]
  else:
    d1 = d
  if t2[7] > d:
    d2 = t2[7]
  else:
    d2 = d


  coordinates1 = []
  c11 = calculate_new_point(t1[4],t1[5],t1[6],d1,azimuth,0,-w/2/d1)
  b11 = calculate_new_point(c11[0],c11[1],c11[2],l,azimuth-math.degrees(math.atan(div)),s,0)
  b12 = calculate_new_point(c11[0],c11[1],c11[2],l,azimuth-90,s,0)

  coordinates1.append(c11)
  coordinates1 = coordinates1 + points_on_arc(c11, b11, b12, b11[2], "ccw", 1)

  c21 = calculate_new_point(t2[4],t2[5],t2[6],d2,azimuth-180,0,w/2/d2)
  b21 = calculate_new_point(c21[0],c21[1],c21[2],l,azimuth-180+90,s,0)
  b22 = calculate_new_point(c21[0],c21[1],c21[2],l,azimuth-180+math.degrees(math.atan(div)),s,0)

  coordinates1 = coordinates1 + points_on_arc(c21, b21, b22, b21[2], "ccw", 1)
  coordinates1.append(c21)

#################################

  coordinates2 = []
  c12 = calculate_new_point(t1[4],t1[5],t1[6],d1,azimuth,0,w/2/d1)
  b13 = calculate_new_point(c12[0],c12[1],c12[2],l,azimuth+math.degrees(math.atan(div)),s,0)
  b14 = calculate_new_point(c12[0],c12[1],c12[2],l,azimuth+90,s,0)

  coordinates2.append(c12)
  coordinates2 = coordinates2 + points_on_arc(c12, b13, b14, b13[2], "cw", 1)

  c22 = calculate_new_point(t2[4],t2[5],t2[6],d2,azimuth-180,0,-w/2/d2)
  b23 = calculate_new_point(c22[0],c22[1],c22[2],l,azimuth-180-90,s,0)
  b24 = calculate_new_point(c22[0],c22[1],c22[2],l,azimuth-180-math.degrees(math.atan(div)),s,0)

  coordinates2 = coordinates2 + points_on_arc(c22, b23, b24, b23[2], "cw", 1)
  coordinates2.append(c22)

  return coordinates1,coordinates2

def area2d(arp, radius, elev, resolution=360):
  points = []
  for i in range(resolution):
    angle = 2 * math.pi * i / resolution
    x = arp[0] + radius * math.cos(angle)
    y = arp[1] + radius * math.sin(angle)
    points.append((x, y, elev))
  return points


def export_surfaces(coordinates, annex, surface_name):
    geom = []
    for i in coordinates:
        geom.append(Polygon(i))
    gdf_surface = gpd.GeoDataFrame(geometry=geom, crs=str(EPSG))

    # geojson_str = gdf_surface.to_crs(4326).to_json()
    # print(geojson_str)
    
    # Create a temporary directory
    temp_dir = tempfile.mkdtemp()
    # Split the surface name into parts using specific delimiters
    parts = surface_name.split("_RWY")[0].split("-")
    # Extract the desired part
    extracted_part = parts[-1]  # Extract the last part
    # Set the file name without suffix
    temp_file_name = extracted_part
    # Construct the full path of the temporary file
    temp_file_path = os.path.join(temp_dir, temp_file_name)
    # Export GeoDataFrame to KML file
    gdf_surface.to_crs(epsg=4326).to_file(temp_file_path, driver='KML')
    # Read the contents of the KML file
    with open(temp_file_path, 'r') as f:
        kml_data = f.read()
    # Print the KML data
    print(kml_data)
    # Delete the temporary file and directory
    os.remove(temp_file_path)
    os.rmdir(temp_dir)

    """
    if not os.path.exists(folder_name):
        os.makedirs(folder_name)
    
    airport_timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")  # Get current timestamp for airport directory
    airport_directory = folder_name + "/" + airport + "_" + airport_timestamp

    if not os.path.exists(airport_directory):
        os.makedirs(airport_directory)
    if not os.path.exists(airport_directory+"/"+annex):
        os.makedirs(airport_directory+"/"+annex)
    if not os.path.exists(airport_directory+"/"+annex+"/UTM"):
        os.makedirs(airport_directory+"/"+annex+"/UTM")
    if not os.path.exists(airport_directory+"/"+annex+"/Geographic"):
        os.makedirs(airport_directory+"/"+annex+"/Geographic")
    if not os.path.exists(airport_directory+"/"+annex+"/KML"):
        os.makedirs(airport_directory+"/"+annex+"/KML")
    if not os.path.exists(airport_directory+"/"+annex+"/GeoJSON"):
        os.makedirs(airport_directory+"/"+annex+"/GeoJSON")

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")  # Get current timestamp
    file_name = airport + "_" + surface_name + "_" + timestamp

    gdf_surface.to_file(airport_directory+"/"+annex+"/UTM/"+file_name+'_Epsg'+str(EPSG)+'.shp')  # utm shp
    gdf_surface.to_crs(4326).to_file(airport_directory+"/"+annex+"/Geographic/"+file_name+'_Epsg4326.shp')  # geographic shp
    gdf_surface.to_crs(4326).to_file(airport_directory+"/"+annex+"/KML/"+file_name+'_Epsg4326.kml', driver='KML')  # geographic kml
    gdf_surface.to_crs(4326).to_file(airport_directory+"/"+annex+"/GeoJSON/"+file_name+'_Epsg4326.geojson', driver='GeoJSON')  # geographic GeoJSON
    
    """

# create coordinates of surfaces
area2a_coordinates = [area2a(t1,t2,runway,strip,azimuth)]
area2b_coordinates = list(area2b(t1,t2,l_etod,s_etod,div_etod,runway,strip,azimuth))
area2c_coordinates = list(area2c(t1,t2,l_etod,s_etod,div_etod,runway,strip,azimuth))
area2d_coordinates = [area2d(arp, r_etod, ref_elev + h_etod)]

annex15 = "Annex15"

export_surfaces(area2a_coordinates, annex15, "Area_2a_RWY" + t1[3] + "-" + t2[3])
export_surfaces(area2b_coordinates, annex15, "Area_2b_RWY" + t1[3] + "-" + t2[3])
export_surfaces(area2c_coordinates, annex15, "Area_2c_RWY" + t1[3] + "-" + t2[3])
export_surfaces(area2d_coordinates, annex15, "Area_2d_RWY" + t1[3] + "-" + t2[3])
#export_surfaces(area2a_coordinates + area2b_coordinates + area2c_coordinates + area2d_coordinates, annex15, "Area_2_RWY" + t1[3] + "-" + t2[3])


#zip
#shutil.make_archive(folder_name, 'zip', folder_name)