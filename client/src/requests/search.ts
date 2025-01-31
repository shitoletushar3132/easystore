import axios from "axios";
import { BASEURL } from "../helper/constant";

const search = async (text: string) => {
  try {
    const response = await axios.get(`${BASEURL}/search/${text}`, {
      withCredentials: true,
    });
    return response.data; // Returning data instead of just logging
  } catch (error: any) {
    console.error("Search Error:", error.response?.data || error.message);
    throw error; // Rethrowing to handle it where called
  }
};

export default search;
