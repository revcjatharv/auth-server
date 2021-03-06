const httpStatus = require('http-status');
const tokenService = require('./token.service');
const userService = require('./user.service');
const Token = require('../models/token.model');
const ApiError = require('../utils/ApiError');
const { tokenTypes } = require('../config/tokens');
const getVideoId = require('get-video-id');
const sys = require('sys')
const exec = require('child_process').exec;
const compose = require('docker-compose');
const yaml = require('js-yaml');
const jsonConvert = require('json2yaml')
const fs   = require('fs');




/**
 * Login with username and password
 * @param {string} email
 * @param {string} password
 * @returns {Promise<User>}
 */
const loginUserWithEmailAndPassword = async (email, password) => {
  const user = await userService.getUserByEmail(email);
  if (!user || !(await user.isPasswordMatch(password))) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Incorrect email or password');
  }
  return user;
};


const getVideoStreamFromGuest = async (req,res) => {
  const range = req.headers.range;
  const fileType = req.headers.fileType;
  if (!range) {
    return res.status(400).send("Requires Range header");
  }

  if(!fileType) {
    return res.status(400).send("Requires fileType header");
  }
  // get video stats (about 61MB)
  let videoPath = "/home/ubuntu/download.mp4";
  let videoSize = fs.statSync("/home/ubuntu/download.mp4").size;

  if(fileType === 'audio') {
   videoPath = "/home/ubuntu/download.mp3";
   videoSize = fs.statSync("/home/ubuntu/download.mp3").size;
  }

  // Parse Range
  // Example: "bytes=32324-"
  const CHUNK_SIZE = 10 ** 6; // 1MB
  const start = Number(range.replace(/\D/g, ""));
  const end = Math.min(start + CHUNK_SIZE, videoSize - 1);

  // Create headers
  const contentLength = end - start + 1;
  const headers = {
    "Content-Range": `bytes ${start}-${end}/${videoSize}`,
    "Accept-Ranges": "bytes",
    "Content-Length": contentLength,
    "Content-Type": "video/mp4",
  };

  if(fileType === 'audio') {
    headers["Content-Type"]= 'audio/mpeg'
  }



  // HTTP Status 206 for Partial Content
  res.writeHead(206, headers);

  // create video read stream for this particular chunk
  const strem = fs.createReadStream(videoPath, { start, end });

  // Stream the video chunk to the client
  return strem.pipe(res);
}

const runProcess = async (meetingId) => {
  // Get document, or throw exception on error
  let doc = yaml.safeLoad(fs.readFileSync('/home/ubuntu/auth-server/src/additional/bbb-streaming/docker-compose.yml', 'utf8'));
		
  doc["services"]["bbb-streamer"]["environment"][2] =`BBB_MEETING_ID=${meetingId}`;
	console.log(doc)
  fs.writeFile('/home/ubuntu/auth-server/src/additional/bbb-streaming/docker-compose.yml', yaml.safeDump(doc), (err) => {
      if (err) {
          console.log("error in writting file",err);
          return err;
      }

      compose.upAll({ cwd: '/home/ubuntu/auth-server/src/additional/bbb-streaming', log: true })
      .then(
        () => {
          console.log('done');
          return true;
        },
        err => {
          console.log('something went wrong:', err.message)
          return false;
        }
      );
  });



  //let child;
  // executes `pwd`
  //  child = exec("/home/ubuntu/auth-server/src/additional/startStream.sh",[BBB_URL,BBB_SECRET,BBB_START_MEETING,BBB_ATTENDEE_PASSWORD,BBB_MODERATOR_PASSWORD,BBB_MEETING_TITLE,BBB_DOWNLOAD_MEETING,BBB_INTRO,BBB_STREAM_URL,BBB_CUSTOM_CSS,TZ], function (error, stdout, stderr) {
  //  console.log('stdout: ' + stdout);
  //  console.log('stderr: ' + stderr);
  //   if (error !== null) {
  //     console.log('exec error: ' + error);
  //   }
  //  });
}

const removeStreaming = async () => {
  compose.kill({ cwd: '/home/ubuntu/auth-server/src/additional/bbb-streaming', log: true })
    .then(
      () => {
        console.log("Killed")
        return true
      },
      err => {
        console.log("something wen wrong", err.message)
        return false
      }
    )
}

/**
 * Logout
 * @param {string} refreshToken
 * @returns {Promise}
 */
const logout = async (refreshToken) => {
  const refreshTokenDoc = await Token.findOne({ token: refreshToken, type: tokenTypes.REFRESH, blacklisted: false });
  if (!refreshTokenDoc) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Not found');
  }
  await refreshTokenDoc.remove();
};


const getYouTubeVideo = async (data) => {
  if (!data.meetingId) {
    return {
      status: false,
      message: 'Video not found/created',
      data: {}
    }
  }

  console.log(data.meetingId, 'This is he meeting ID');
  const url = 'https://www.youtube.com/embed/live_stream?channel=UCnDCaneRZE7O4MYpdkJhKCg'
  const { id } = getVideoId(url);

  return {
    status: true,
    message: 'Video Foudn successfully',
    data: { url, id }
  }
};


/**
 * Refresh auth tokens
 * @param {string} refreshToken
 * @returns {Promise<Object>}
 */
const refreshAuth = async (refreshToken) => {
  try {
    const refreshTokenDoc = await tokenService.verifyToken(refreshToken, tokenTypes.REFRESH);
    const user = await userService.getUserById(refreshTokenDoc.user);
    if (!user) {
      throw new Error();
    }
    await refreshTokenDoc.remove();
    return tokenService.generateAuthTokens(user);
  } catch (error) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Please authenticate');
  }
};

/**
 * Reset password
 * @param {string} resetPasswordToken
 * @param {string} newPassword
 * @returns {Promise}
 */
const resetPassword = async (resetPasswordToken, newPassword) => {
  try {
    const resetPasswordTokenDoc = await tokenService.verifyToken(resetPasswordToken, tokenTypes.RESET_PASSWORD);
    const user = await userService.getUserById(resetPasswordTokenDoc.user);
    if (!user) {
      throw new Error();
    }
    await Token.deleteMany({ user: user.id, type: tokenTypes.RESET_PASSWORD });
    await userService.updateUserById(user.id, { password: newPassword });
  } catch (error) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Password reset failed');
  }
};

module.exports = {
  loginUserWithEmailAndPassword,
  logout,
  refreshAuth,
  resetPassword,
  getYouTubeVideo,
  runProcess,
  removeStreaming,
  getVideoStreamFromGuest
};
