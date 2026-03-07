Idea: build a cab booking app that automates the process of comapring prices across different cab apps and booking the best one for your needs.

User phone -> elevenlabs agent -> backend -> android emulator (controlled by backend but also by CLaude Code/Gemini via MCP) -> 

Flow:
1. Front end: Mobile first web app. ElevenLabs Agents SDK to have a chat/voice interface to book a cab. 
First time user flow: If user hasn't set up the app yet, the agent will open a flow to add their cab apps. For every new app they want to add, backend will launch an android emulator (headless) and stream the screen to the user. User can then log in to their cab app. Once logged in, backend will use MCP to verify that the user has logged in successfully and save the appId and emulatorId to users profile. This is going to be saved to MongoDB. The user will also have the ability here to add any extra details that's worth noting for these apps. For instance, if this specific cab service has any constraints, like limited service, hours of operation etc. 
If the user wants to add more apps, the flow repeats. 
2. Once the user has set up cab apps, they speak/text with the agent to request a cab. the agent's responsibility is to get the pickup and dropoff location, optionally the number of people and any other constraints. 
Constraints:
a. User wants the cab as soon as possible.
b. User wants the cheapest cab possible.
c. User wants the most comfortable cab possible.
d. User wants the most luxurious cab possible.
e. User wants the most eco friendly cab possible.
f. User wants to only book a free cab (some cab apps offer free cabs for students, but service is limited to certain areas and takes longer)
g. User wants a cab from a specific cab app.
h. User wants a cab that can accommodate a certain number of people.
i. User wants a cab that can accommodate a certain amount of luggage.
j. User wants a cab that's cheap but is ready to wait a bit longer.
k. User wants a cab that's cheap but is not ready to wait.
3. Once the agent has all the information, it will pass this data off to the backend in a specific schema JSON format. If the agent is unsure about any of the information, it will ask the user for clarification. 
4. Backend will read information from MongoDB and spawn a new emulator for each cab app the user has set up. Once the emulator is spawned, it will use the appId to launch the app.
5. Once all the apps are launched, backend will spawn an instance of claude code with a system prompt that includes all the information of the users cab apps. The user prompt will include the pickup and dropoff location, optionally the number of people and any other constraints.
6. Claude code will be instructed via the system prompt to spawn sub agents for each emulator opened. The sub agents will each have a system prompt on their task. The task is to interact with its emulator using the adb mcp and input the users request (pickup, dropoff, number of people) and its goal is to find out the prices of the different options of that app and report that back to the main agent.
7. Once the main agent has a response from all the apps, depending on the users constrints, it will present the options to the user. If a user requires a cab urgently, it might override and select an option itself.
8. Once the user confirms the cab option, claude kills the remaining sub agents of apps that are not active. With the one that is active, it will ask the sub agent to complete booking the cab. Once done, we will inform the user that the cab has been booked and the flow is complete. 
9. Claude code will also have the subagents make a note of how the cab app navigation and booking process went and what could be improved, and it will save that to a memory file specific to that cab app. This is so that if any mistakes were made that caused the agent to waste time clearing inputs or clicking on the wrong buttons, it will remember to not do that next time. 

Services:
Eleven Labs ElevenAgents SDK - Powered by Gemini API LLMs
Backend deployed on Vultr - Docker image will contain adb, android emulator images.
Claude Code/Gemini CLI - For agentic flow and agent orchestration
MongoDB - Database

These services are chosen because they are sponsoring the hackathon and they have prizes for the best use of their tools. 

Potential improvements:
- If a user requests a cab for later, create some sort of a queue and cron to handle these requests.
- As I write this, I'm realizing that if we have a queue, we can allow multiple users to access the same backend and flows. Each user will have an emu and app associated to them. 


Optional:
- Apple Live Activities: Searching Cab Apps -> Chimes when user input is required -> Booking in progress -> Booked!
    - but this would require us to build an ios app instead of a web app. I was thinking of a PWA, but I'm still considering both options.
- A way to figure out if the user has logged in successfully and added payment methods automatically.
