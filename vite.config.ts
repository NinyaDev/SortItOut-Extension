import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite"; // Import Tailwind CSS plugin                                             
import { resolve } from "path";
                                                                                                
export default defineConfig({
  plugins: [react(), tailwindcss()],                                                                          
  build: {      
    outDir: "dist",
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "popup.html"),
        background: resolve(__dirname, "src/background/index.ts"),                             
      },
      output: {                                                                                
        entryFileNames: "[name].js",                                                           
      },                                                                                       
    },                                                                                         
  },                                                                                           
});             