# Use the official Node.js LTS (Long Term Support) image as the base image
FROM node:lts

# Set the working directory inside the container
WORKDIR /app

# Copy the package.json and package-lock.json files to the container's working directory
COPY package*.json ./

# Install Node.js dependencies
RUN npm install

# Install Python and its dependencies
RUN apt-get update && apt-get install -y python3 python3-pip python3-venv
COPY requirements.txt ./

# Create a virtual environment and activate it
RUN python3 -m venv /venv
ENV PATH="/venv/bin:$PATH"

# Install Python dependencies inside the virtual environment
RUN pip3 install --no-cache-dir -r requirements.txt

# Copy the rest of your Next.js app to the container's working directory
COPY . .

# Build the Next.js app
RUN npm run build

# Expose the port that the Next.js app will run on (change this if necessary)
EXPOSE 3033

# Start the Next.js app
CMD ["npm", "start"]
