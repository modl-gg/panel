## modl - support & moderation reimagined
# Streamline administrative duties with AI, dynamic punishments, and a slick web-interface

# Description

modl is a modern solution to completely streamline moderation and support for you Minecraft server. The system is fully customizable, free to use, and open-sourced under the AGPL-3.0 license. Stay in control of your server from anywhere with our web-interface at https://modl.gg. Utilize AI to automatically handle support tickets and chat reports. Streamline punishments through dynamic punishment types powered by points and severities.

Free forever and completely branded for your server- your players and staff will not see any modl branding (assuming you enable custom domain).

modl can run natively on Spigot, PaperSpigot, Folia, BungeeCord, and Velocity, without feature degradation on any platform.
* SignedVelocity required for Velocity chat features to work. 

**Fully open-source:** github.com/modl-gg
**Locale:** https://github.com/modl-gg/minecraft/blob/main/core/src/main/resources/locale/en_US.yml
**Support Discord:** https://modl.gg/discord
**Image Album:** https://imgur.com/a/AWeFSLf
**Demo Video:** Coming soon

# Features

Third iteration punishment system, designed to fairly sanction players and repeat offenders while maintaining moderator discretion.
 > Fully customizable point system to designate low, medium, and habitual designations for both Gameplay and Social offenses
 > Fully customizable punishment durations for each severity (lenient, normal, severe) and each offender status
 > Issue punishments for bad usernames and skins that automatically pardon when a player changes his/her skin/username.
 > Ability to make a ban "stat-wiping" that issues a command on the server upon __expiration__ to reset stats (voided by pardon or modification)
 > Full modification system for changing durations and pardoning (remove points)
 > Full evidence system for uploading files and linking to other sites (YouTube, imgur, etc)
 > 8-char alphanumeric ID system for streamlined appeal system, staff see all punishment details and can pardon/change duration without leaving the page. Customize the appeal page for each different punishment type.
 > Bans on offline players wait until a successful login until starting the expiration countdown.
 > Stack multiple bans/mute that execute consecutively (one after the other becomes inactive)
 > Traditional, manual punishments also exist (ban, tempban, mute, tempmute, kick, blacklist)

Smart alt account linking system
 > Link accounts that have the same non-proxy IP logins OR have the shared proxy logins within 2 hours of each other. This system tracks logins even if denied by a banned screen, allowing you to link accounts whenever a bad actor screws up and attempts to login on a banned account (to check) before logging into their ban evading account.
 > Handle each linked ban independently- was there a mistake? Public internet or sibling? Easily handle the linked ban on a specific account without changing the initial ban.
 > Linked bans expire when the original ban expire automatically

Support one-stop-shop: use your own domain (recommended: support.yourserver.com)
 > Fully customizable knowledgebase home-page with logo, external link, and sections
 > Queryable markdown article support, write your rules, guidelines, and support articles with ease
 > Create fully custom forms for bug reports, support tickets, and staff applications: reveal hidden sections based on answer to multiple-choice questions.
 > Customizable quick-response buttons to significantly streamline effeciency and keep responses consistent.
 > Send in-game and email notifications for when staff respond to a player's ticket
 > We use browser cookies to verify that respondees in tickets are the same as the initial responder.
 > Staff members are automatically subscribed to tickets they respond in and can easily track updates to those tickets in their home feed.
 
Player Reporting 
 > Automatically snapshot full context chat-logs when someone is chat-reported.
 > Allow players to upload files or link external evidence to all reports
 > Issue punishments from reports without leaving the page

Smart AI chat moderation
 > To not pester players and use excessive tokens, AI chat moderation only scans messages that are chat-reported. This is the most effective way of moderating chat as current systems that analyse all messages issuing auto-mutes are incredibly annoying for players and expensive.
 > Constantly evolving system prompts to improve accuracy of AI auto-mod, is context-aware of Minecraft (e.g: "i'm going to kill you with a fireball" is a game term, not an IRL death threat).
 > Configure AI to look for specific things and execute punishment types automatically or make suggestions for staff approval

Full Audit System
 > Audit and rollbock any staff punishment actions
 > See statistics on average ticket response times and staff activity (ticket responses, punishments issued, etc)
 > See trends for different types of punishments and ticket data
 > Manage all files uploaded (evidence, ticket attachments): easily view, search, filter, delete, and download all files

Professional Interface
 > Invite your staff team and fully customize their roles and permissions (permission nodes for each punishment type)
 > Set each staff member's Minecraft account so that permissions and punishments are synced between panel and in-game.
 > Make it yours- upload a custom logo, favicon, homepage image, and set your custom domain. 
 > Everything is fully customizable, from Minecraft plugin locale to ticket forms and punishment types.

Extremely Generous Free Tier, we only charge for what we pay for our selves.
 > 2GB CDN (file storage)
 > Up to 15 staff members
 > All features except for AI auto-mod (for chat reports)
 > Premium gets 200GB CDN ($0.05/GB/month after), Unlimited Staff, and Unlimited* AI auto-mod (*subject to change) for $20/month

Planned Features
 > Discord integration
 > Implementation of additional authentication features (FIDO2, 2FA)
 > In-game GUI for punishments and player lookups

# Requirements
1. Java 8+
2. Working internet connection
3. Any version Spigot, PaperSpigot, Folia, BungeeCord, or Velocity

# Installation
1. Register your server at https://modl.gg
2. Go to your panel's settings and find your API key under "Server & Billing" > "Server Configuration". 
3. Drop Modl_Minecraft_Release-1.0-SNAPSHOT.jar into your /plugins directory (Do NOT install on multiple Spigot servers if you run a network, install on your proxy)
4. Restart your server and wait for /plugins/modl/config.yml to generate, once it does input your API key and restart
5. Done!

**For support, please join our discord server (https://modl.gg/discord) or open an issue on GitHub (https://github.com/modl-gg/issue-tracker/issues). If you encounter any issues or bugs, please report them :)**
