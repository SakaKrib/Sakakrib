const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey"
};
function generateCaption(listing) {
  const priceStr = new Intl.NumberFormat("en-KE").format(listing.price_kes);
  const typeLabel = listing.listing_type === "sale" ? "FOR SALE" : "FOR RENT";
  const depositInfo = listing.deposit_required ? " | Deposit required" : " | No deposit";
  return `🏠 ${typeLabel}: ${listing.title}

📍 Location: ${listing.city}, ${listing.county}
💰 Price: KES ${priceStr}${listing.listing_type === "rent" ? "/month" : ""}
🛏️ Size: ${listing.size} (${listing.beds} bed, ${listing.baths} bath)${depositInfo}

${listing.description}

🔑 Verified listing on Saka Krib — Kenya's trusted home marketplace.
Find your next home effortlessly at Saka Krib.

#SakaKrib #KenyaRealEstate #${listing.city.replace(/\s/g, "")} #${listing.listing_type === "sale" ? "HouseForSale" : "HouseForRent"}`;
}
Deno.serve(async (req)=>{
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders
    });
  }
  try {
    const { listing } = await req.json();
    // Try Gemini API if key is available
    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    let aiCaption = "";
    if (geminiKey) {
      try {
        const prompt = `You are a real estate social media expert. Create an engaging, professional LinkedIn-style community post for this property listing in Kenya. Make it warm, informative, and exciting. Use emojis tastefully. Keep it under 300 words.

Title: ${listing.title}
Location: ${listing.city}, ${listing.county}
Price: KES ${new Intl.NumberFormat("en-KE").format(listing.price_kes)} ${listing.listing_type === "rent" ? "per month" : ""}
Type: ${listing.listing_type}
Size: ${listing.size}
Bedrooms: ${listing.beds}
Bathrooms: ${listing.baths}
Deposit: ${listing.deposit_required ? "Required" : "Not required"}
Description: ${listing.description}

Generate a compelling social media post:`;
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: prompt
                  }
                ]
              }
            ],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 300
            }
          })
        });
        if (response.ok) {
          const data = await response.json();
          aiCaption = data.candidates?.[0]?.content?.parts?.[0]?.text || generateCaption(listing);
        } else {
          aiCaption = generateCaption(listing);
        }
      } catch  {
        aiCaption = generateCaption(listing);
      }
    } else {
      // Fallback: generate a structured caption locally
      aiCaption = generateCaption(listing);
    }
    return new Response(JSON.stringify({
      caption: aiCaption
    }), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({
      error: err.message
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }
});
