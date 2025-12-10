# Arcane Audio Archer
By Marco Salsiccia

This is an accessible audio-based archery game created by the Blind for the Blind. This game was co-coded using ChatGPT 5.1, where the model provided the structure of the code, and I rewrote and tweaked it to ensure that it was all both accessible and usable.

[Arcane Audio Archer live site](https://marconius.com/fun/audioArcher/)

## How to Play

* The game creates an audio space with your archer on the left and the targets appearing on the right.
* Once the game starts, a target will be pulled up into vertical position at a random spot on the right side of the field. There's an audible ping to signify where in space the target is set.
* Start by setting the bow angle. An increasing and decreasing tone will play, and pressing the Set Aim,Space Bar or Enter key will set the angle of your shot.
* The power will be set next, using a sound effect that stretches from the left to center to identify the value. Again, press Set Aim, Space Bar, or the Enter key to set the power.
* The arrow will loose. There are different sounds fort a high miss, a low miss, and a target strike.
* You have 5 arrows in your quiver. This will reset back to 5 once you've hit the target and move to the next round.
* You get 100 points for a target strike, plus 100 more points for each arrow left in your quiver.
* As the rounds progress, the target will start appearing in increasingly wide horizontal and tall vertical ranges in the field. The target will also start decreasing in size to increase difficulty.
* Enter your initials if you get a high score once the game is over.

## Game Settings

* Toggle the previous shot blips played during the Angle and Power sound effects on and off.
* Reduce the screen reader spoken verbosity; removes "Angle," "Power," "Too High," "Too Low," and "You earned..." callouts from aria announcements.

## Game Features

* Pure JavaScript-based stereo sound effects.
* Fully accessible via keyboard and screen reader. Mobile version playable using Braille Screen Input in command mode.
* Fully WCAG 2.2 AA compliant webpage, with theming for light and dark modes.
* Mobile-first and responsive design.
* Visual indicators for sighted players.
* Realistic ballistics model for the arrow flight.
* Retro high scores with Initials tracking.

## Tech Stack

HTML, CSS, JavaScript, PHP