# Diary-app-BE

## Table of Contents
1. [ChatGPT API](#chatgpt-api)
    - [Emotions Recognition](#emotions-recognition)
    - [Context Prediction](#context-prediction)
    - [Image Generation](#image-generation)

2. [User API](#user-api)
    - [Signup](#signup)
    - [Login](#login)
    - [getUser](#getuser)

3. [Diary API](#diary-api)
    - [Create a Diary Entry](#create-a-diary-entry)
    - [Retrieve a Diary Entry](#retrieve-a-diary-entry)
    - [Retrieve all Diary Entries of a User](#retrieve-all-diary-entries)
    - [Update a Diary Entry](#update-a-diary-entry)
    - [Delete a Diary Entry](#delete-a-diary-entry)

## ChatGPT API

### Emotions Recognition

#### Endpoint: `api/chatgpt/emotions-recognition`
- **Description**: Identifying the emotions in the diary entry based on the diary entry and the dialog between the user and the assistant
- **Request Type**: POST
- **Required Fields**:
    - `diary`: The diary entry of the user
    - `dialog`: The dialog history between the user and the assistant

### Context Prediction

#### Endpoint: `api/chatgpt/context-prediction`
- **Description**: Predict the `location`, `people`, and `activity` of the diary entry
- **Request Type**: POST
- **Required Fields**:
    - `diary`: The diary entry of the user

### Image Generation

#### Endpoint: `api/chatgpt/image-generation`
- **Description**: Generate an image based on the diary entry
- **Request Type**: POST
- **Required Fields**:
    - `diary`: The diary entry of the user


## User API

### Signup

#### Endpoint: `/api/users/signup`
- **Description**: Register a new user
- **Request Type**: POST
- **Required Fields**:
    - `name`: User's name
    - `gender`: User's gender, the options are `male`, `female`, and `other`

#### Request Example:
```json
{
    "name": "Hong Gildong",
    "gender": "male"
}
```

#### Responses
- `422`: Request is not valid
- `400 User exists already`: There is a user associated with this name, please login instead

### Login

#### Endpont: `/api/users/login`
- **Description**: Login into an existing account and get an authentication token
- **Request Type**: POST
- **Required Fields**:
    - `name`: User's name

#### Request Example:
```json
{
    "name": "Hong Gildong"
}
```

#### Responses
- `401 Invalid credentials`: Wrong name
- `200 OK`: Successfully logged in

### getUser

#### Endpoint: `/api/users/(userid)`
- **Description**: Retrieve the user details from the id
- **Request Type**: GET
- **Headers**: 
  - Include the Bearer Token in the header.
    - `Authorization: Bearer <token_value>`

#### Responses
- `400 User does not exist`: There is no user information associated with the user id

## Diary API

### Create a Diary Entry

#### Endpoint: `/api/diary/create`
- **Description**: Create a new diary entry
- **Request Type**: POST
- **Request Body**
    - `userid`: String
    - `timestamp`: Date
    - `content`: String (optional)
    - `emotions`: [String] (optional)
    - `people`: [String] (optional)
    - `location`: String (optional)
    - `dialog`: An array of JSON objects, where each object represents a dialog entry (optional). Each dialog object includes:
         - `role`: A string indicating the role of the speaker (`user` or `assistant`).
         - `content`: A string containing the text of the dialog.
    - `images`: [String] (optional)
    - `createdAt`: Will be default to the current time of creating the entry

#### Request Example
```json
{
    "userid": "6694dc...",
    "timestamp": "2024-07-19T12:34:56.789Z",
    "content": "I'm not sure what this is",
    "emotions": ["confused", "sad"],
    "people": ["Michael"],
    "location": "Home",
    "dialog": [
        {
            "role": "user",
            "content": "I'm so confused when I see this picture"
        },
        {
            "role": "assistant",
            "content": "Where did you first saw the picture?"
        }
    ],
    "images": ["link-to-an-image"]
}
```

#### Responses
 - `422`: Request is not valid
 - `201 OK`: A diary entry is successfully created

### Retrieve a Diary Entry

#### Endpoint: `/api/diary/(user id)/(diary id)`

- **Description**: Retrieve the diary details of a diary entry of a user
- **Request Type**: GET

#### Responses
- `400 User does not exist`: There is no user associated with the user id
- `400 Diary does not exist`: There is no diary entry associated with the diary id

### Retrieve all Diary Entries

#### Endpoint: `api/diary/(user id)`

- **Description**: Retrieve all diary entries of a user with pagination
- **Request Type**: GET

#### Responses
- `400 User does not exist`: There is no user associated with the user id

### Update a Diary Entry

#### Endpoint: `/api/diary/(user id)/(diary id)`

- **Description**: Update the diary details of a diary entry of a user
- **Request Type**: PATCH
- **Request Body**
    - `timestamp`: Date (optional)
    - `content`: String (optional)
    - `emotions`: [String] (optional)
    - `people`: [String] (optional)
    - `location`: String (optional)
    - `dialog`: An array of JSON objects, where each object represents a dialog entry (optional). Each dialog object includes:
         - `role`: A string indicating the role of the speaker (`user` or `assistant`).
         - `content`: A string containing the text of the dialog.
    - `images`: [String] (optional)
    - `createdAt`: Will be default to the current time of updating the entry

#### Request Example
```json
{
    "timestamp": "2024-07-19T12:34:56.789Z",
    "content": "I'm not sure what this is",
    "emotions": ["confused", "sad"],
    "people": ["Michael"],
    "location": "Home",
    "dialog": [
        {
            "role": "user",
            "content": "I'm so confused when I see this picture"
        },
        {
            "role": "assistant",
            "content": "Where did you first saw the picture?"
        }
    ],
    "images": ["link-to-an-image"]
}
```

#### Responses
- `400 User does not exist`: There is no user associated with the user id
- `400 Diary does not exist`: There is no diary entry associated with the diary id
- `200 OK`: The diary is updated

### Delete a Diary Entry

#### Endpoint: `/api/diary/(user id)/(diary id)`

- **Description**: Delete the diary details of a diary entry of a user
- **Request Type**: DELETE

#### Responses
- `400 User does not exist`: There is no user associated with the user id
- `400 Diary does not exist`: There is no diary entry associated with the diary id
- `200 OK`: The diary is deleted