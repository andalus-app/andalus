#!/bin/bash

while true
do
  echo ""
  echo "Moving to project folder..."
  cd /Users/fatihkoker/andalus || exit

  echo ""
  git status

  echo ""
  read -p "Enter commit message: " commitmsg

  git add -A
  git commit -m "$commitmsg"
  git push origin main

  echo ""
  echo "Clearing cache..."
  rm -rf node_modules/.cache

  echo ""
  echo "Running deploy..."
  SKIP_PREFLIGHT_CHECK=true CI=false npm run deploy

  echo ""
  read -p "Do you want to deploy again? (y/n): " answer

  if [[ "$answer" != "y" ]]; then
      echo "Done."
      break
  fi
done
