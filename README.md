# Typescript lambda Behind ALB

With Github Action to build and deploy.


This repo is a Typescript AWS CDK project

It creates:
S3 Bucket
DynamoDb table
Application Load Balancer (ALB)
Lambdas that:
1. Will add an item to the DynamoDb table with info about objects added to the S3 bucket
2. Respond to hits of the ALB, with a listing of the items added to the S3 bucket.


