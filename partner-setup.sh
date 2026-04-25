#!/bin/bash

echo "👥 Partner Setup Script"
echo "======================="
echo ""

# Check Git
if ! command -v git &> /dev/null; then
    echo "❌ Git not installed. Install from: https://git-scm.com/"
    exit 1
fi

# Check Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker not installed. Install Docker Desktop."
    exit 1
fi

# Clone repo
echo "📥 Cloning repository..."
git clone https://github.com/YOUR_USERNAME/lead-gen-system.git
cd lead-gen-system

# Setup environment
echo "⚙️ Setting up environment..."
cp .env.example .env

echo ""
echo "🔑 IMPORTANT: Edit .env file and add API keys!"
echo "Contact Fahad for the actual keys."
echo ""
echo "After adding keys, run: ./start.sh"