#!/bin/bash
curl -X POST http://localhost:5000/api/chat -H "Content-Type: application/json" -d '{"message": "bhai tum kaun ho"}'