// Function implementations for the Azure OpenAI Assistant tools

// Weather function implementation
const getWeather = async (args) => {
  try {
    const parsedArgs = JSON.parse(args);
    const location = parsedArgs.location;
    const unit = parsedArgs.unit || 'c';
    
    console.log(`Weather request for ${location} in ${unit}`);
    
    // Simulated weather data based on location
    const weatherData = {
      'Seattle': { temp: unit === 'c' ? 15 : 59, condition: 'rainy', forecast: 'Showers expected all week' },
      'New York': { temp: unit === 'c' ? 22 : 72, condition: 'partly cloudy', forecast: 'Warming trend through weekend' },
      'Tokyo': { temp: unit === 'c' ? 18 : 65, condition: 'clear', forecast: 'Clear skies for the next few days' },
      'London': { temp: unit === 'c' ? 12 : 54, condition: 'foggy', forecast: 'Fog clearing by midday tomorrow' },
      'San Francisco': { temp: unit === 'c' ? 17 : 63, condition: 'windy', forecast: 'Wind advisory in effect until Friday' },
      'Paris': { temp: unit === 'c' ? 20 : 68, condition: 'sunny', forecast: 'Perfect weather all week' },
      'Sydney': { temp: unit === 'c' ? 25 : 77, condition: 'hot', forecast: 'Heat wave expected to continue' }
    };
    
    // Default weather data for locations not in our database
    const defaultWeather = { temp: unit === 'c' ? 20 : 68, condition: 'sunny', forecast: 'No specific forecast available' };
    
    // Find the closest match in our database or use the default
    const closestMatch = Object.keys(weatherData).find(city => 
      location.toLowerCase().includes(city.toLowerCase())
    );
    
    const weather = closestMatch ? weatherData[closestMatch] : defaultWeather;
    
    return JSON.stringify({
      location,
      temperature: weather.temp,
      unit,
      condition: weather.condition,
      forecast: weather.forecast
    });
  } catch (error) {
    console.error('Error in get_weather function:', error);
    return JSON.stringify({ error: String(error) });
  }
};

// Joke function implementation
const tellJoke = async (args) => {
  try {
    const parsedArgs = JSON.parse(args);
    const topic = parsedArgs.topic;
    const style = parsedArgs.style || 'dad joke';
    
    console.log(`Joke requested about ${topic} in ${style} style`);
    
    // Sample jokes based on topic and style
    const jokes = {
      'programming': {
        'dad joke': 'Why do programmers always mix up Christmas and Halloween? Because Oct 31 == Dec 25!',
        'pun': 'I told my computer I needed a break, and now it won\'t stop sending me vacation ads.',
        'one-liner': 'A programmer had a problem. He decided to use Java. Now he has a ProblemFactory.',
        'knock-knock': 'Knock knock. Who\'s there? [very long pause] Java. Java who? Sorry, the garbage collector interrupted me.'
      },
      'food': {
        'dad joke': 'I told my wife she should embrace her mistakes. She gave me a hug.',
        'pun': 'I\'m on a seafood diet. I see food and I eat it!',
        'one-liner': 'My doctor told me I should watch what I eat, so I ordered a pizza and watched it closely.',
        'knock-knock': 'Knock knock. Who\'s there? Lettuce. Lettuce who? Lettuce in, it\'s cold out here!'
      },
      'animals': {
        'dad joke': 'What do you call a deer with no eyes? No idea!',
        'pun': 'What did the buffalo say to his son when he left for college? Bison!',
        'one-liner': 'My dog is so smart that when I say "Beatles" he knows I mean the band not the insects.',
        'knock-knock': 'Knock knock. Who\'s there? Cow says. Cow says who? No, cow says moo!'
      }
    };
    
    // Default joke if topic isn't found
    const defaultJokes = {
      'dad joke': 'What\'s brown and sticky? A stick!',
      'pun': 'I used to be a baker, but I couldn\'t make enough dough.',
      'one-liner': 'I told my wife she was drawing her eyebrows too high. She looked surprised.',
      'knock-knock': 'Knock knock. Who\'s there? Boo. Boo who? Don\'t cry, it\'s just a joke!'
    };
    
    // Find joke based on topic and style
    let joke;
    if (jokes[topic] && jokes[topic][style]) {
      joke = jokes[topic][style];
    } else if (jokes[topic]) {
      // If style not found but topic exists, use any joke for that topic
      joke = Object.values(jokes[topic])[0];
    } else {
      // If topic not found, use default joke for the requested style
      joke = defaultJokes[style] || defaultJokes['dad joke'];
    }
    
    return JSON.stringify({
      topic,
      style,
      joke
    });
  } catch (error) {
    console.error('Error in tell_joke function:', error);
    return JSON.stringify({ error: String(error) });
  }
};

// Recipe suggestion function implementation
const suggestRecipe = async (args) => {
  try {
    const parsedArgs = JSON.parse(args);
    const ingredients = parsedArgs.ingredients || [];
    const diet = parsedArgs.diet || 'none';
    const mealType = parsedArgs.meal_type || 'dinner';
    
    console.log(`Recipe requested with ingredients: ${ingredients.join(', ')}, diet: ${diet}, meal type: ${mealType}`);
    
    // Sample recipes
    const recipes = [
      {
        name: "Vegetable Stir Fry",
        ingredients: ["vegetables", "soy sauce", "rice", "garlic", "ginger"],
        diet: "vegetarian",
        mealType: "dinner",
        instructions: "1. Heat oil in a wok\n2. Stir fry vegetables and aromatics\n3. Add sauce\n4. Serve over rice"
      },
      {
        name: "Avocado Toast",
        ingredients: ["bread", "avocado", "lemon", "salt", "pepper"],
        diet: "vegan",
        mealType: "breakfast",
        instructions: "1. Toast bread\n2. Mash avocado with lemon juice\n3. Spread on toast\n4. Season with salt and pepper"
      },
      {
        name: "Keto Bacon and Eggs",
        ingredients: ["eggs", "bacon", "cheese", "butter"],
        diet: "keto",
        mealType: "breakfast",
        instructions: "1. Cook bacon until crispy\n2. Scramble eggs in bacon fat\n3. Top with cheese\n4. Serve with a pat of butter"
      },
      {
        name: "Chocolate Chip Cookies",
        ingredients: ["flour", "chocolate", "butter", "sugar", "eggs"],
        diet: "none",
        mealType: "dessert",
        instructions: "1. Cream butter and sugar\n2. Add eggs\n3. Mix in dry ingredients\n4. Fold in chocolate chips\n5. Bake at 350°F for 10-12 minutes"
      },
      {
        name: "Quinoa Salad",
        ingredients: ["quinoa", "vegetables", "lemon", "olive oil"],
        diet: "gluten-free",
        mealType: "lunch",
        instructions: "1. Cook quinoa according to package\n2. Chop vegetables\n3. Mix everything together\n4. Dress with lemon juice and olive oil"
      }
    ];
    
    // Find recipes that match at least some ingredients and dietary preference
    let matchingRecipes = recipes.filter(recipe => {
      // Check if diet matches (or recipe is for everyone)
      const dietMatch = diet === 'none' || recipe.diet === diet || recipe.diet === 'none';
      
      // Check if meal type matches
      const mealMatch = recipe.mealType === mealType;
      
      // Check if at least one ingredient matches
      const ingredientMatch = ingredients.some(ingredient => 
        recipe.ingredients.some(recipeIngredient => 
          recipeIngredient.toLowerCase().includes(ingredient.toLowerCase())
        )
      );
      
      return dietMatch && mealMatch && ingredientMatch;
    });
    
    // If no matches, find a recipe that matches just the diet
    if (matchingRecipes.length === 0) {
      matchingRecipes = recipes.filter(recipe => recipe.diet === diet || recipe.diet === 'none');
    }
    
    // If still no matches, return a default recipe
    if (matchingRecipes.length === 0) {
      return JSON.stringify({
        recipe: {
          name: "Simple Pasta",
          ingredients: ["pasta", "olive oil", "garlic", "salt"],
          instructions: "1. Boil pasta\n2. Heat oil and garlic\n3. Toss pasta in oil\n4. Season to taste"
        },
        note: "This is a default recipe since we couldn't find a good match for your request"
      });
    }
    
    // Return a random matching recipe
    const selectedRecipe = matchingRecipes[Math.floor(Math.random() * matchingRecipes.length)];
    
    return JSON.stringify({
      recipe: {
        name: selectedRecipe.name,
        ingredients: selectedRecipe.ingredients,
        diet: selectedRecipe.diet,
        mealType: selectedRecipe.mealType,
        instructions: selectedRecipe.instructions
      }
    });
  } catch (error) {
    console.error('Error in suggest_recipe function:', error);
    return JSON.stringify({ error: String(error) });
  }
};

// Export all function implementations
module.exports = {
  getWeather,
  tellJoke,
  suggestRecipe
}; 