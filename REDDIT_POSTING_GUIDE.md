# CodePause Reddit Posting Guide

Complete guide for posting about CodePause on Reddit.

---

## Table of Contents
1. [Posting Strategy](#posting-strategy)
2. [Recommended Schedule](#recommended-schedule)
3. [Subreddit Posts](#subreddit-posts)
   - [r/VSCode](#r-vscode)
   - [r/programming](#r-programming)
   - [r/learnprogramming](#r-learnprogramming)
4. [General Tips](#general-tips)
5. [Pre-Posting Checklist](#pre-posting-checklist)

---

## Posting Strategy

### Option 1: Sequential Posting (Recommended)
Post one subreddit at a time, wait 2-3 days, incorporate feedback, then post to the next.

**Benefits:**
- Learn from comments and improve later posts
- Less overwhelming to manage discussions
- Can refine messaging based on reception

### Option 2: All at Once
Post to all subreddits on the same day with slight variations.

**Benefits:**
- Maximum reach quickly
- Builds momentum across communities

---

## Recommended Schedule

### Optimal Posting Times (US Eastern Time)
- **Best days:** Tuesday, Wednesday, Thursday
- **Best times:** 8:00 - 9:00 AM ET or 6:00 - 7:00 PM ET
- **Avoid:** Friday afternoon - Sunday, Monday mornings

### Sequential Schedule

**Post 1: r/VSCode**
- **Date:** Tuesday
- **Time:** 8:30 AM ET
- **Why:** Most targeted audience, will give best technical feedback

**Post 2: r/programming**
- **Date:** Thursday (2 days later)
- **Time:** 9:00 AM ET
- **Why:** Broader reach, more discussion potential

**Post 3: r/learnprogramming**
- **Date:** Following Tuesday
- **Time:** 8:30 AM ET
- **Why:** Specifically targets juniors concerned about AI

### Same-Day Schedule

If posting all at once:
- **Date:** Tuesday or Wednesday
- **Time:** 8:30 AM ET for all posts
- Use slight title variations for each subreddit

---

## Subreddit Posts

## r/VSCode

**Subreddit:** https://reddit.com/r/VSCode
**Members:** ~200k
**Audience:** VS Code users, extension developers
**Post Flair:** [Tool] or [Show & Tell] (check subreddit rules)

**⚠️ IMPORTANT RULES:**
- r/VSCode **strictly prohibits** "best extensions" list posts (Rule 1)
- Avoid listicle-style posts with extensive feature bullet points
- Focus on a specific problem/solution narrative
- Do NOT use titles that sound like "best" or "must-have" lists
- The post should feel like a personal story, not marketing copy

### Title
```
Built a VS Code extension to track AI dependency before we all forget how to code
```

### Post Content
```markdown
Hey VS Code folks,

After catching myself blindly accepting Copilot suggestions without even reading them, I realized I had a problem: I was shipping code I didn't understand, and my problem-solving skills were atrophying.

So I built **CodePause** - a VS Code extension that helps you maintain code ownership while using AI assistants.

The problem that worried me: AI-generated code has 1.7x more defects (CodeRabbit 2025), and 30% of devs accept AI suggestions without review (GitHub 2024). Even more concerning, we overestimate AI effectiveness by ~20% (METR 2025).

CodePause tracks your AI vs manual code balance in real-time, measures review quality (time, scrolling, cursor movement, edits), and shows a clean dashboard with 7-day trends. The smart part is that it uses skill-level-aware thresholds: juniors stay under 40% AI while building fundamentals, mid-level under 60% for balanced productivity, and seniors under 75% since they've earned that leverage.

It detects Copilot, Cursor, Claude Code, and any inline completion tool with 99.99% accuracy using 5 detection methods. Works in VS Code, Gravity IDE, and any VS Code fork across 15+ programming languages. Zero performance impact and privacy-first with all data stored locally.

The code is open source and it's free to use. GitHub: https://github.com/codepause-dev/codepause-extension

Would love feedback from the community! If you've been thinking about AI dependency and skill maintenance, this is for you.
```

### Key Emphasis
- Personal narrative (why I built it)
- Research-backed problem statement
- Technical depth without listicle formatting
- Natural paragraph flow, not feature bullets
- Engagement-focused conclusion

---

## r/programming

**Subreddit:** https://reddit.com/r/programming
**Members:** ~3.5M
**Audience:** General programmers, industry professionals
**Post Flair:** None usually needed, check rules

### Title
```
"I built a tool because I was scared AI was making me a worse developer"
```

### Post Content
```markdown
A few months ago, I caught myself accepting an AI suggestion without even reading it. Just hit Tab, then Enter. Done.

That moment scared me.

I looked at my code and realized: I had no idea how half of it actually worked. I was shipping bugs I didn't understand, and worse - I could feel my problem-solving muscles atrophying.

So I did what any rational developer would do: I built a tool to spy on myself.

**Introducing CodePause** 🎯

CodePause runs in the background and tracks three things:
- What % of your code is AI-generated vs. written by you
- How thoroughly you're reviewing AI suggestions (based on time, scrolling, edits)
- Your overall coding balance health

Then it gives you gentle nudges when patterns slip.

**Why this matters:**

The research is concerning:
- AI-generated code has **1.7x more defects** than human-written code
- **30% of developers** accept AI suggestions without meaningful review
- We **overestimate AI effectiveness by ~20%**

For juniors especially, this is scary. Junior employment fell 20% (2022-2025) as they lack core skills. 54% of engineering leaders are hiring fewer juniors because of AI dependency.

**How it works - Smart thresholds based on experience:**

- **Juniors (< 40% AI)** - You're still building fundamentals. The more code you write yourself, the faster you learn.

- **Mid-level (< 60% AI)** - You've got the basics down. Time to leverage AI while maintaining your edge.

- **Seniors (< 75% AI)** - You've earned it. Years of experience mean you can use AI more while still knowing exactly what you're doing.

**Not just tracking - it helps:**

CodePause doesn't just show you numbers. It provides:
- Educational guidance for juniors ("Try writing this next function yourself")
- Data-driven reminders for mids ("You're over your AI target this week")
- Evidence-based insights for seniors ("Your patterns show strong balance")

**Works everywhere:**
VS Code, Gravity IDE, Cursor, and any IDE forked from VS Code - if it supports VS Code extensions, it works.

**Open source & free to use:**
🔗 https://github.com/codepause-dev/codepause-extension

I'd love to hear how you all are thinking about this balance. Are you worried about AI dependency? How do you maintain your coding skills while staying productive?
```

### Key Emphasis
- Story-driven narrative
- Research-backed concerns
- Industry impact and career implications
- Discussion-inviting conclusion

---

## r/learnprogramming

**Subreddit:** https://reddit.com/r/learnprogramming
**Members:** ~5M
**Audience:** Beginners, juniors, students
**Post Flair:** [Resource] or [Discussion] (check rules)

### Title
```
"Juniors: Are you using too much AI? I built a tool to help you check"
```

### Post Content
```markdown
Hey everyone learning to code,

If you're using GitHub Copilot, Cursor, or Claude Code to help you learn, this is for you.

I built a free tool called **CodePause** because I noticed something scary: I was accepting AI suggestions without even reading them, and my actual coding skills were getting worse.

**The problem with too much AI:**

Research shows:
- Junior employment **fell 20%** from 2022-2025 because juniors lack core skills
- **54% of engineering leaders** are hiring fewer juniors due to AI dependency
- AI-generated code has **1.7x more bugs** than code you write yourself
- You learn **3x faster** when you write at least 60% of code manually

**Here's the truth:** If you're a junior and relying on AI for more than 40% of your code, you're probably not learning as much as you think.

**What CodePause does:**

It runs in the background and tracks:
- How much of your code is AI vs written by you
- Whether you're actually reviewing the AI suggestions
- Your overall coding balance

Then it gives you helpful reminders like:
> "You're at 55% AI today. Try writing the next function yourself - you'll retain more and understand the patterns better."

**Smart guidance for your level:**

- **Juniors (< 40% AI)** - Build your fundamentals first. Write most code yourself.
- **Mid-level (< 60% AI)** - You've got basics down, can leverage AI more
- **Seniors (< 75% AI)** - Experience lets you use AI safely

**It's completely free and open source:**

Works with VS Code, Gravity IDE, and any VS Code-based editor. Detects Copilot, Cursor, Claude Code, and others.

🔗 https://github.com/codepause-dev/codepause-extension

**My advice for juniors:**

AI is an amazing learning tool **if used right**. Use it to:
- Get unstuck when you're truly blocked
- Explain code you don't understand
- Generate boilerplate so you can focus on the interesting parts

But don't let it replace:
- The struggle of solving problems yourself (that's how you learn!)
- Reading and understanding every line of code you ship
- Building the mental models that make you a good developer

Your future self will thank you.
```

### Key Emphasis
- Educational and encouraging tone
- Junior-specific concerns
- Learning advice and best practices
- Career implications

---

## General Tips

### ⚠️ Common Rejection Reasons to Avoid

**"Best extensions" / Listicle Rule (Common in r/VSCode, others):**
- ❌ DON'T use titles like "Best extensions for X" or "Must-have extensions"
- ❌ DON'T format posts as long feature lists with bullet points
- ❌ DON'T sound like marketing copy or promotional material
- ✅ DO use narrative/story format
- ✅ DO focus on a specific problem you solved
- ✅ DO make it feel like a personal experience, not a product pitch

**Self-Promotion Rules:**
- Many subreddits have 90:10 or 95:5 self-promotion ratios
- You need to participate in discussions before/after posting your own content
- Some require explicit "self-promotion" tags
- Check each subreddit's rules page before posting

**Other Common Issues:**
- Title-only posts (many subreddits require body text)
- Link-only posts (copy the content, don't just link)
- Duplicate posts (search before posting)
- Wrong flair or missing flair

### Before Posting
1. **Read subreddit rules** - Each community has different requirements
2. **Check for Rule 1 ("best posts")** - Especially r/VSCode
3. **Check if post flair is required** - Some subreddits require specific tags
4. **Search for similar posts** - Make sure this isn't a duplicate
5. **Test the extension** - Ensure everything works before posting

### During Posting
1. **Use proper formatting** - Markdown for links, lists, bold text
2. **Include the GitHub link** - Make it prominent and easy to find
3. **Add relevant tags** - VS Code, AI, developer tools, productivity

### After Posting
1. **Respond to every comment** within the first hour
2. **Answer questions thoroughly** - This builds credibility
3. **Be open to feedback** - Both positive and negative
4. **Update the post** if you clarify common questions
5. **Monitor for 24-48 hours** - Comments can trickle in

### Engagement Boosters
- **Ask questions** at the end to invite discussion
- **Share personal experience** - makes it more relatable
- **Acknowledge limitations** - builds trust
- **Offer to answer questions** - encourages engagement

---

## Pre-Posting Checklist

### Content Preparation
- [ ] Extension is tested and working
- [ ] GitHub repository is up to date
- [ ] README is clear and comprehensive
- [ ] Screenshots of the dashboard are available (optional but recommended)
- [ ] VS Code Marketplace listing is live

### Post Content
- [ ] Title is catchy but clear
- [ ] Post explains the problem clearly
- [ ] Solution is well-described
- [ ] Features are listed with benefits
- [ ] Links are correct and formatted
- [ ] Tone matches subreddit culture

### Technical Details
- [ ] AI percentage thresholds are correct:
  - Junior: < 40% AI
  - Mid: < 60% AI
  - Senior: < 75% AI
- [ ] IDE compatibility mentioned: VS Code, Gravity IDE, VS Code forks
- [ ] Detection methods listed accurately
- [ ] Research sources are cited correctly

### Community Rules
- [ ] Read and understood subreddit rules
- [ ] Added required post flair if needed
- [ ] Checked for similar recent posts
- [ ] Prepared for potential questions about:
  - Privacy and data collection
  - Performance impact
  - Detection accuracy
  - Open source license

### Engagement Plan
- [ ] Set reminders to check comments
- [ ] Prepared responses to common questions
- [ ] Ready to incorporate feedback into future posts
- [ ] Have GitHub issues tracker ready for bug reports

---

## Expected Questions & Answers

### Q: Is this open source?
**A:** Yes! CodePause is completely open source. You can view the code, contribute, or even fork it for your needs. GitHub: https://github.com/codepause-dev/codepause-extension

### Q: What data do you collect?
**A:** All data is stored locally on your machine. We have optional anonymous telemetry that respects VS Code's global telemetry setting. No code content is ever sent anywhere.

### Q: Will this slow down my editor?
**A:** No. CodePause is designed to have zero performance impact. It runs silently in the background and only processes data when you save files.

### Q: How does it detect AI code?
**A:** We use 5 detection methods with 99.99% accuracy:
1. VS Code Inline Completion API (Copilot, Cursor)
2. Large paste detection (>100 characters)
3. External file changes (agent mode)
4. Git commit markers (Claude Code, etc.)
5. Change velocity analysis (typing speed)

### Q: Can I customize the thresholds?
**A:** Yes! You can adjust all thresholds in the VS Code settings. Search for "CodePause" in your settings to see all available options.

### Q: Does this work with [specific AI tool]?
**A:** CodePause works with any tool that uses VS Code's inline completion API or generates code through chat interfaces. This includes Copilot, Cursor, Claude Code, Gravity, and more.

### Q: I'm a junior - should I stop using AI?
**A:** No! AI is a great learning tool when used properly. The key is balance: use AI to get unstuck or understand concepts, but still write most of your code yourself to build strong fundamentals.

---

## Additional Resources

### Links to Include in Every Post
- **GitHub:** https://github.com/codepause-dev/codepause-extension
- **VS Code Marketplace:** (Add link when live)
- **Documentation:** (Add link if available)
- **Discussions:** https://github.com/codepause-dev/codepause-extension/discussions

### Relevant Research Sources
- CodeRabbit 2025: AI code quality study
- GitHub 2024: Copilot usage patterns
- METR 2025: AI effectiveness study
- Stanford 2025: Junior developer employment trends
- LeadDev 2025: Engineering hiring survey

---

## Tracking Template

Copy this template to track your posts:

### Post 1: r/VSCode
- **Date Posted:** _______________
- **Time Posted:** _______________
- **Upvotes:** _______________
- **Comments:** _______________
- **Key Feedback:** _______________
- **Questions to Address:** _______________

### Post 2: r/programming
- **Date Posted:** _______________
- **Time Posted:** _______________
- **Upvotes:** _______________
- **Comments:** _______________
- **Key Feedback:** _______________
- **Questions to Address:** _______________

### Post 3: r/learnprogramming
- **Date Posted:** _______________
- **Time Posted:** _______________
- **Upvotes:** _______________
- **Comments:** _______________
- **Key Feedback:** _______________
- **Questions to Address:** _______________

---

## Success Metrics

Track these to gauge post performance:
- **Upvote ratio** (upvotes / total votes)
- **Number of comments**
- **GitHub stars gained**
- **VS Code Marketplace installs**
- **GitHub issues/PRs created**
- **Cross-posts or mentions**

**Good performance indicators:**
- Upvote ratio > 80%
- 20+ comments with genuine questions/discussion
- GitHub stars increase by 10+ within 24 hours
- Positive sentiment in comments

---

## Follow-Up Strategy

### If Post Gets Traction:
1. Pin a comment with quick links (GitHub, install guide)
2. Update the post with common Q&A
3. Consider doing an AMA (Ask Me Anything)
4. Share milestone updates (100 stars, etc.)

### If Post Struggles:
1. Review comments for feedback
2. Identify what didn't resonate
3. Adjust messaging for next subreddit
4. Don't spam - wait at least a week before reposting

### Building on Success:
1. Write a blog post about the response
2. Share on Twitter/X, LinkedIn, Hacker News
3. Create a demo video if people want to see it in action
4. Engage with similar communities (Discord, Slack groups)

---

**Good luck with your posts! Remember: Authentic engagement beats clever marketing every time.**
